/**
 * 消息 Reducer 模块
 * 参考 happy/sources/sync/reducer/reducer.ts
 * 
 * 核心职责：
 * 1. 消息去重：使用 localId、messageId、toolId 多重追踪
 * 2. 工具权限管理：处理工具权限请求和响应
 * 3. 工具调用生命周期：创建、匹配、更新状态
 * 4. 消息类型转换：将内部格式转换为 UI 消息类型
 * 
 * @module sync/reducer
 */

const ENABLE_LOGGING = false;

/**
 * 内部 Reducer 消息格式
 * @typedef {Object} ReducerMessage
 * @property {string} id - 内部 ID
 * @property {string|null} realID - 原始消息 ID
 * @property {number} createdAt - 创建时间
 * @property {'user'|'agent'} role - 角色
 * @property {string|null} text - 文本内容
 * @property {Object|null} event - 事件对象
 * @property {Object|null} tool - 工具调用对象
 * @property {Object} [meta] - 元数据
 */

/**
 * Reducer 状态
 * @typedef {Object} ReducerState
 * @property {Map<string, string>} toolIdToMessageId - toolId/permissionId -> messageId
 * @property {Map<string, string>} sidechainToolIdToMessageId - sidechain toolId -> messageId
 * @property {Map<string, Object>} permissions - 权限详情
 * @property {Map<string, string>} localIds - localId -> messageId
 * @property {Map<string, string>} messageIds - 原始ID -> 内部ID
 * @property {Map<string, ReducerMessage>} messages - 所有消息
 * @property {Map<string, ReducerMessage[]>} sidechains - sidechain 消息
 * @property {Object} [latestTodos] - 最新 todo 数据
 * @property {Object} [latestUsage] - 最新 usage 数据
 */

/**
 * Reducer 结果
 * @typedef {Object} ReducerResult
 * @property {Message[]} messages - 变更的消息列表
 * @property {Array} [todos] - todo 数据
 * @property {Object} [usage] - usage 数据
 * @property {boolean} [hasReadyEvent] - 是否有 ready 事件
 */

let idCounter = 0;

/**
 * 生成唯一 ID
 * @returns {string}
 */
function allocateId() {
  return `msg-${++idCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建 Reducer 状态
 * @returns {ReducerState}
 */
function createReducer() {
  return {
    toolIdToMessageId: new Map(),
    sidechainToolIdToMessageId: new Map(),
    permissions: new Map(),
    messages: new Map(),
    localIds: new Map(),
    messageIds: new Map(),
    sidechains: new Map(),
    latestTodos: null,
    latestUsage: null
  };
}

/**
 * 重置 Reducer 状态
 * @param {ReducerState} state
 */
function resetReducer(state) {
  state.toolIdToMessageId.clear();
  state.sidechainToolIdToMessageId.clear();
  state.permissions.clear();
  state.messages.clear();
  state.localIds.clear();
  state.messageIds.clear();
  state.sidechains.clear();
  state.latestTodos = null;
  state.latestUsage = null;
  idCounter = 0;
}

/**
 * 主 Reducer 函数
 * @param {ReducerState} state - 当前状态
 * @param {NormalizedMessage[]} messages - 规范化消息数组
 * @param {Object} [agentState] - Agent 状态（权限等）
 * @returns {ReducerResult}
 */
function reducer(state, messages, agentState) {
  if (ENABLE_LOGGING) {
    console.log(`[REDUCER] Called with ${messages.length} messages`);
  }

  const newMessages = [];
  const changed = new Set();
  let hasReadyEvent = false;

  // 分离 sidechain 和非 sidechain 消息
  let nonSidechainMessages = messages.filter(msg => !msg.isSidechain);
  const sidechainMessages = messages.filter(msg => msg.isSidechain);

  //
  // Phase 0: 处理 AgentState 权限
  //
  if (agentState) {
    // 处理 pending 权限请求
    if (agentState.requests) {
      for (const [permId, request] of Object.entries(agentState.requests)) {
        // 跳过已完成的权限
        if (agentState.completedRequests && agentState.completedRequests[permId]) {
          continue;
        }

        const existingMessageId = state.toolIdToMessageId.get(permId);
        if (existingMessageId) {
          // 更新现有工具消息的权限
          const message = state.messages.get(existingMessageId);
          if (message?.tool && !message.tool.permission) {
            message.tool.permission = { id: permId, status: 'pending' };
            changed.add(existingMessageId);
          }
        } else {
          // 创建新的工具消息
          const mid = allocateId();
          const toolCall = {
            id: permId,  // 使用权限 ID 作为工具 ID
            name: request.tool,
            state: 'running',
            input: request.arguments,
            createdAt: request.createdAt || Date.now(),
            startedAt: null,
            completedAt: null,
            description: null,
            result: undefined,
            permission: { id: permId, status: 'pending' }
          };

          state.messages.set(mid, {
            id: mid,
            realID: null,
            role: 'agent',
            createdAt: request.createdAt || Date.now(),
            text: null,
            tool: toolCall,
            event: null
          });

          state.toolIdToMessageId.set(permId, mid);
          state.permissions.set(permId, {
            tool: request.tool,
            arguments: request.arguments,
            createdAt: request.createdAt || Date.now(),
            status: 'pending'
          });
          changed.add(mid);
        }
      }
    }

    // 处理已完成的权限
    if (agentState.completedRequests) {
      for (const [permId, completed] of Object.entries(agentState.completedRequests)) {
        const messageId = state.toolIdToMessageId.get(permId);
        if (messageId) {
          const message = state.messages.get(messageId);
          if (message?.tool) {
            // 更新权限状态
            if (!message.tool.permission) {
              message.tool.permission = { id: permId, status: completed.status };
            } else {
              message.tool.permission.status = completed.status;
              message.tool.permission.reason = completed.reason;
              message.tool.permission.mode = completed.mode;
              message.tool.permission.decision = completed.decision;
            }

            // 更新工具状态
            if (completed.status === 'approved') {
              if (message.tool.state !== 'completed' && message.tool.state !== 'error') {
                message.tool.state = 'running';
              }
            } else {
              message.tool.state = 'error';
              message.tool.completedAt = completed.completedAt || Date.now();
              if (completed.reason) {
                message.tool.result = { error: completed.reason };
              }
            }
            changed.add(messageId);
          }
        }

        // 更新存储的权限
        state.permissions.set(permId, {
          tool: completed.tool,
          arguments: completed.arguments,
          createdAt: completed.createdAt || Date.now(),
          completedAt: completed.completedAt,
          status: completed.status,
          reason: completed.reason
        });
      }
    }
  }

  //
  // Phase 0.5: 过滤 ready 事件
  //
  const messagesToProcess = [];
  for (const msg of nonSidechainMessages) {
    // 检查是否已处理
    if (msg.role === 'user' && msg.localId && state.localIds.has(msg.localId)) {
      continue;
    }
    if (state.messageIds.has(msg.id)) {
      continue;
    }

    // 过滤 ready 事件
    if (msg.role === 'event' && msg.content?.type === 'ready') {
      state.messageIds.set(msg.id, msg.id);
      hasReadyEvent = true;
      continue;
    }

    // Handle context reset events - reset state
    if (msg.role === 'event' && msg.content?.type === 'message' && 
        msg.content?.message === 'Context was reset') {
      state.latestTodos = { todos: [], timestamp: msg.createdAt };
      state.latestUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreation: 0,
        cacheRead: 0,
        contextSize: 0,
        timestamp: msg.createdAt
      };
      // Continue to process - let event create a message
    }

    // Handle compaction completed - reset usage only
    if (msg.role === 'event' && msg.content?.type === 'message' && 
        msg.content?.message === 'Compaction completed') {
      state.latestUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreation: 0,
        cacheRead: 0,
        contextSize: 0,
        timestamp: msg.createdAt
      };
      // Continue to process - let event create a message
    }

    messagesToProcess.push(msg);
  }
  nonSidechainMessages = messagesToProcess;

  //
  // Phase 1: 处理用户消息和文本消息
  //
  for (const msg of nonSidechainMessages) {
    if (msg.role === 'user') {
      // 检查去重
      if (msg.localId && state.localIds.has(msg.localId)) continue;
      if (state.messageIds.has(msg.id)) continue;

      const mid = allocateId();
      state.messages.set(mid, {
        id: mid,
        realID: msg.id,
        role: 'user',
        createdAt: msg.createdAt,
        text: msg.content?.text || '',
        tool: null,
        event: null,
        meta: msg.meta
      });

      if (msg.localId) {
        state.localIds.set(msg.localId, mid);
      }
      state.messageIds.set(msg.id, mid);
      changed.add(mid);
    } else if (msg.role === 'agent') {
      // 检查去重
      if (state.messageIds.has(msg.id)) continue;
      state.messageIds.set(msg.id, msg.id);

      // 处理 usage 数据
      if (msg.usage) {
        processUsageData(state, msg.usage, msg.createdAt);
      }

      // 处理文本内容（工具调用在 Phase 2 处理）
      const content = msg.content || [];
      for (const c of content) {
        if (c.type === 'text') {
          const mid = allocateId();
          state.messages.set(mid, {
            id: mid,
            realID: msg.id,
            role: 'agent',
            createdAt: msg.createdAt,
            text: c.text,
            tool: null,
            event: null,
            meta: msg.meta
          });
          changed.add(mid);
        }
      }
    }
  }

  //
  // Phase 2: 处理工具调用
  //
  for (const msg of nonSidechainMessages) {
    if (msg.role === 'agent') {
      const content = msg.content || [];
      for (const c of content) {
        if (c.type === 'tool-call') {
          const existingMessageId = state.toolIdToMessageId.get(c.id);

          if (existingMessageId) {
            // 更新现有消息
            const message = state.messages.get(existingMessageId);
            if (message?.tool) {
              message.realID = msg.id;
              message.tool.description = c.description;
              message.tool.startedAt = msg.createdAt;
              
              if (message.tool.permission?.status === 'approved' && message.tool.state === 'completed') {
                message.tool.state = 'running';
                message.tool.completedAt = null;
                message.tool.result = undefined;
              }
              changed.add(existingMessageId);

              // 跟踪 TodoWrite
              if (message.tool.name === 'TodoWrite' && message.tool.input?.todos) {
                if (!state.latestTodos || message.tool.createdAt > state.latestTodos.timestamp) {
                  state.latestTodos = {
                    todos: message.tool.input.todos,
                    timestamp: message.tool.createdAt
                  };
                }
              }
            }
          } else {
            // 创建新工具消息
            const permission = state.permissions.get(c.id);
            const toolCall = {
              id: c.id,  // 保留工具 ID 用于追踪
              name: c.name,
              state: 'running',
              input: permission ? permission.arguments : c.input,
              createdAt: permission ? permission.createdAt : msg.createdAt,
              startedAt: msg.createdAt,
              completedAt: null,
              description: c.description,
              result: undefined
            };

            if (permission) {
              toolCall.permission = {
                id: c.id,
                status: permission.status,
                reason: permission.reason,
                mode: permission.mode,
                decision: permission.decision
              };

              if (permission.status !== 'approved') {
                toolCall.state = 'error';
                toolCall.completedAt = permission.completedAt || msg.createdAt;
                if (permission.reason) {
                  toolCall.result = { error: permission.reason };
                }
              }
            }

            const mid = allocateId();
            state.messages.set(mid, {
              id: mid,
              realID: msg.id,
              role: 'agent',
              createdAt: msg.createdAt,
              text: null,
              tool: toolCall,
              event: null,
              meta: msg.meta
            });

            state.toolIdToMessageId.set(c.id, mid);
            changed.add(mid);

            // 跟踪 TodoWrite
            if (toolCall.name === 'TodoWrite' && toolCall.input?.todos) {
              if (!state.latestTodos || toolCall.createdAt > state.latestTodos.timestamp) {
                state.latestTodos = {
                  todos: toolCall.input.todos,
                  timestamp: toolCall.createdAt
                };
              }
            }
          }
        }
      }
    }
  }

  //
  // Phase 3: 处理工具结果
  //
  for (const msg of nonSidechainMessages) {
    if (msg.role === 'agent') {
      const content = msg.content || [];
      for (const c of content) {
        if (c.type === 'tool-result') {
          const messageId = state.toolIdToMessageId.get(c.tool_use_id);
          if (!messageId) continue;

          const message = state.messages.get(messageId);
          if (!message?.tool || message.tool.state !== 'running') continue;

          message.tool.state = c.is_error ? 'error' : 'completed';
          message.tool.result = c.content;
          message.tool.completedAt = msg.createdAt;

          // 更新权限数据
          if (c.permissions) {
            if (message.tool.permission) {
              message.tool.permission.status = c.permissions.result === 'approved' ? 'approved' : 'denied';
              message.tool.permission.date = c.permissions.date;
              message.tool.permission.mode = c.permissions.mode;
              message.tool.permission.decision = c.permissions.decision;
            } else {
              message.tool.permission = {
                id: c.tool_use_id,
                status: c.permissions.result === 'approved' ? 'approved' : 'denied',
                date: c.permissions.date,
                mode: c.permissions.mode,
                decision: c.permissions.decision
              };
            }
          }

          changed.add(messageId);
        }
      }
    }
  }

  //
  // Phase 4: 处理 sidechain 消息
  //
  for (const msg of sidechainMessages) {
    if (state.messageIds.has(msg.id)) continue;
    state.messageIds.set(msg.id, msg.id);

    // 获取 sidechain ID（从 content 中提取）
    const content = msg.content || [];
    let sidechainId = null;
    
    for (const c of content) {
      if (c.type === 'sidechain') {
        sidechainId = c.uuid;
        break;
      }
      if (c.parentUUID) {
        sidechainId = c.parentUUID;
        break;
      }
    }

    if (!sidechainId) continue;

    const existingSidechain = state.sidechains.get(sidechainId) || [];

    // 处理 sidechain 内容
    for (const c of content) {
      if (c.type === 'sidechain') {
        const mid = allocateId();
        const userMsg = {
          id: mid,
          realID: msg.id,
          role: 'user',
          createdAt: msg.createdAt,
          text: c.prompt,
          tool: null,
          event: null
        };
        state.messages.set(mid, userMsg);
        existingSidechain.push(userMsg);
      } else if (c.type === 'text') {
        const mid = allocateId();
        const textMsg = {
          id: mid,
          realID: msg.id,
          role: 'agent',
          createdAt: msg.createdAt,
          text: c.text,
          tool: null,
          event: null
        };
        state.messages.set(mid, textMsg);
        existingSidechain.push(textMsg);
      } else if (c.type === 'tool-call') {
        const mid = allocateId();
        const toolCall = {
          id: c.id,  // 保留工具 ID
          name: c.name,
          state: 'running',
          input: c.input,
          createdAt: msg.createdAt,
          startedAt: null,
          completedAt: null,
          description: c.description,
          result: undefined
        };

        const toolMsg = {
          id: mid,
          realID: msg.id,
          role: 'agent',
          createdAt: msg.createdAt,
          text: null,
          tool: toolCall,
          event: null
        };
        state.messages.set(mid, toolMsg);
        existingSidechain.push(toolMsg);
        state.sidechainToolIdToMessageId.set(c.id, mid);
      } else if (c.type === 'tool-result') {
        const sidechainMessageId = state.sidechainToolIdToMessageId.get(c.tool_use_id);
        if (sidechainMessageId) {
          const sidechainMessage = state.messages.get(sidechainMessageId);
          if (sidechainMessage?.tool && sidechainMessage.tool.state === 'running') {
            sidechainMessage.tool.state = c.is_error ? 'error' : 'completed';
            sidechainMessage.tool.result = c.content;
            sidechainMessage.tool.completedAt = msg.createdAt;
          }
        }
      }
    }

    state.sidechains.set(sidechainId, existingSidechain);

    // 标记父工具消息已变更
    for (const [internalId, message] of state.messages) {
      if (message.realID === sidechainId && message.tool) {
        changed.add(internalId);
        break;
      }
    }
  }

  //
  // Phase 5: 处理事件消息
  //
  for (const msg of nonSidechainMessages) {
    if (msg.role === 'event') {
      const mid = allocateId();
      state.messages.set(mid, {
        id: mid,
        realID: msg.id,
        role: 'agent',
        createdAt: msg.createdAt,
        event: msg.content,
        tool: null,
        text: null,
        meta: msg.meta
      });
      changed.add(mid);
    }
  }

  //
  // 收集变更的消息
  //
  for (const id of changed) {
    const existing = state.messages.get(id);
    if (!existing) continue;

    const message = convertReducerMessageToMessage(existing, state);
    if (message) {
      newMessages.push(message);
    }
  }

  if (ENABLE_LOGGING) {
    console.log(`[REDUCER] Changed messages: ${changed.size}`);
  }

  return {
    messages: newMessages,
    todos: state.latestTodos?.todos,
    usage: state.latestUsage ? {
      inputTokens: state.latestUsage.inputTokens,
      outputTokens: state.latestUsage.outputTokens,
      cacheCreation: state.latestUsage.cacheCreation,
      cacheRead: state.latestUsage.cacheRead,
      contextSize: state.latestUsage.contextSize
    } : undefined,
    hasReadyEvent: hasReadyEvent || undefined
  };
}

/**
 * 处理 Usage 数据
 * @param {ReducerState} state
 * @param {Object} usage
 * @param {number} timestamp
 */
function processUsageData(state, usage, timestamp) {
  if (!state.latestUsage || timestamp > state.latestUsage.timestamp) {
    state.latestUsage = {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheCreation: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
      contextSize: (usage.cache_creation_input_tokens || 0) + 
                   (usage.cache_read_input_tokens || 0) + 
                   (usage.input_tokens || 0),
      timestamp
    };
  }
}

/**
 * 将 Reducer 消息转换为 UI 消息
 * @param {ReducerMessage} reducerMsg
 * @param {ReducerState} state
 * @returns {Message|null}
 */
function convertReducerMessageToMessage(reducerMsg, state) {
  const { MessageTypes } = window;
  
  if (reducerMsg.role === 'user' && reducerMsg.text !== null) {
    return MessageTypes.createUserTextMessage({
      id: reducerMsg.id,
      localId: null,
      createdAt: reducerMsg.createdAt,
      text: reducerMsg.text,
      displayText: reducerMsg.meta?.displayText,
      meta: reducerMsg.meta
    });
  }
  
  if (reducerMsg.role === 'agent' && reducerMsg.text !== null) {
    return MessageTypes.createAgentTextMessage({
      id: reducerMsg.id,
      localId: null,
      createdAt: reducerMsg.createdAt,
      text: reducerMsg.text,
      meta: reducerMsg.meta
    });
  }
  
  if (reducerMsg.role === 'agent' && reducerMsg.tool !== null) {
    // 转换子消息
    const childMessages = [];
    const children = reducerMsg.realID ? state.sidechains.get(reducerMsg.realID) || [] : [];
    
    for (const child of children) {
      const childMessage = convertReducerMessageToMessage(child, state);
      if (childMessage) {
        childMessages.push(childMessage);
      }
    }

    return MessageTypes.createToolCallMessage({
      id: reducerMsg.id,
      localId: null,
      createdAt: reducerMsg.createdAt,
      tool: { ...reducerMsg.tool },
      children: childMessages,
      meta: reducerMsg.meta
    });
  }
  
  if (reducerMsg.role === 'agent' && reducerMsg.event !== null) {
    return MessageTypes.createAgentEventMessage({
      id: reducerMsg.id,
      createdAt: reducerMsg.createdAt,
      event: reducerMsg.event,
      meta: reducerMsg.meta
    });
  }

  return null;
}

/**
 * 获取所有消息（按时间排序）
 * @param {ReducerState} state
 * @returns {Message[]}
 */
function getAllMessages(state) {
  const messages = [];
  
  for (const reducerMsg of state.messages.values()) {
    // 只获取根级消息（不在 sidechain 中的）
    let isInSidechain = false;
    for (const sidechain of state.sidechains.values()) {
      if (sidechain.some(m => m.id === reducerMsg.id)) {
        isInSidechain = true;
        break;
      }
    }
    
    if (!isInSidechain) {
      const message = convertReducerMessageToMessage(reducerMsg, state);
      if (message) {
        messages.push(message);
      }
    }
  }
  
  // 按创建时间排序
  messages.sort((a, b) => a.createdAt - b.createdAt);
  
  return messages;
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.MessageReducer = {
    createReducer,
    resetReducer,
    reducer,
    getAllMessages
  };
}
