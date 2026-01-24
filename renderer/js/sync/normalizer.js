/**
 * 消息规范化模块
 * 参考 happy/sources/sync/typesRaw.ts 的 normalizeRawMessage 函数
 * 将服务端发来的原始消息解析为规范化的消息格式
 * 
 * @module sync/normalizer
 */

/**
 * 规范化的 Agent 内容类型
 * @typedef {Object} NormalizedTextContent
 * @property {'text'} type
 * @property {string} text
 * @property {string} uuid
 * @property {string|null} parentUUID
 */

/**
 * @typedef {Object} NormalizedToolCallContent
 * @property {'tool-call'} type
 * @property {string} id
 * @property {string} name
 * @property {any} input
 * @property {string|null} description
 * @property {string} uuid
 * @property {string|null} parentUUID
 */

/**
 * @typedef {Object} NormalizedToolResultContent
 * @property {'tool-result'} type
 * @property {string} tool_use_id
 * @property {any} content
 * @property {boolean} is_error
 * @property {string} uuid
 * @property {string|null} parentUUID
 * @property {Object} [permissions]
 */

/**
 * @typedef {Object} NormalizedSidechainContent
 * @property {'sidechain'} type
 * @property {string} uuid
 * @property {string} prompt
 */

/**
 * @typedef {Object} NormalizedSummaryContent
 * @property {'summary'} type
 * @property {string} summary
 */

/**
 * 规范化消息
 * @typedef {Object} NormalizedMessage
 * @property {string} id
 * @property {string|null} localId
 * @property {number} createdAt
 * @property {'user'|'agent'|'event'} role
 * @property {boolean} isSidechain
 * @property {Object} [meta]
 * @property {Object} [usage]
 */

/**
 * 规范化原始消息
 * @param {string} id - 消息 ID
 * @param {string|null} localId - 本地 ID
 * @param {number} createdAt - 创建时间戳
 * @param {Object} raw - 原始消息对象
 * @returns {NormalizedMessage|null}
 */
function normalizeRawMessage(id, localId, createdAt, raw) {
  if (!raw || !raw.role) {
    return null;
  }

  // 处理用户消息
  if (raw.role === 'user') {
    const content = raw.content;
    
    // 如果 content 是复杂格式（如 output 类型），交给 agent 处理逻辑
    if (content?.type === 'output' || content?.type === 'codex' || content?.type === 'event') {
      // 修改 role 为 agent，让后续逻辑处理
      raw = { ...raw, role: 'agent' };
    } else {
      // 简单格式的用户消息
      let text = '';
      
      if (typeof content === 'string') {
        text = content;
      } else if (content?.type === 'text') {
        text = content.text || '';
      } else if (content?.text) {
        text = content.text;
      } else if (typeof raw.text === 'string') {
        // 兼容乐观更新的用户消息格式（使用 text 而不是 content）
        text = raw.text;
      }
      
      // 跳过空文本消息
      if (!text || text.trim() === '') {
        return null;
      }
      
      return {
        id,
        localId,
        createdAt,
        role: 'user',
        content: { type: 'text', text },
        isSidechain: false,
        meta: raw.meta
      };
    }
  }

  // 处理 agent 消息
  if (raw.role === 'agent') {
    const content = raw.content;
    
    if (!content) {
      return null;
    }

    // 处理 output 格式
    if (content.type === 'output') {
      const data = content.data;
      
      // 跳过 Meta 消息
      if (data?.isMeta) {
        return null;
      }
      
      // 跳过 compact summary 消息
      if (data?.isCompactSummary) {
        return null;
      }
      
      // 处理 summary 类型
      if (data?.type === 'summary') {
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: false,
          content: [{ type: 'summary', summary: data.summary }],
          meta: raw.meta
        };
      }
      
      // 处理 assistant 消息
      if (data?.type === 'assistant') {
        // 使用 uuid，或回退到 messageId/id，或生成一个
        const uuid = data.uuid || id || `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const normalizedContent = [];
        const messageContent = data.message?.content || [];
        
        for (const c of messageContent) {
          if (c.type === 'text') {
            normalizedContent.push({
              type: 'text',
              text: c.text,
              uuid: uuid,
              parentUUID: data.parentUuid || null
            });
          } else if (c.type === 'tool_use') {
            let description = null;
            if (typeof c.input === 'object' && c.input !== null && 
                'description' in c.input && typeof c.input.description === 'string') {
              description = c.input.description;
            }
            normalizedContent.push({
              type: 'tool-call',
              id: c.id,
              name: c.name,
              input: c.input,
              description,
              uuid: uuid,
              parentUUID: data.parentUuid || null
            });
          }
        }
        
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: data.isSidechain || false,
          content: normalizedContent,
          meta: raw.meta,
          usage: data.message?.usage
        };
      }
      
      // 处理 user 消息（工具结果）
      if (data?.type === 'user') {
        // 生成默认 uuid（如果没有提供）
        const uuid = data.uuid || id;
        
        // 处理 sidechain 用户消息
        if (data.isSidechain && data.message && typeof data.message.content === 'string') {
          return {
            id,
            localId,
            createdAt,
            role: 'agent',
            isSidechain: true,
            content: [{
              type: 'sidechain',
              uuid: uuid,
              prompt: data.message.content
            }]
          };
        }
        
        // 处理普通用户消息（从 output 格式中的 user 类型）
        if (data.message && typeof data.message.content === 'string') {
          const text = data.message.content;
          // 跳过空文本
          if (!text || text.trim() === '') {
            return null;
          }
          return {
            id,
            localId,
            createdAt,
            role: 'user',
            isSidechain: false,
            content: { type: 'text', text }
          };
        }
        
        // 处理工具结果
        const normalizedContent = [];
        const messageContent = data.message?.content;
        
        if (typeof messageContent === 'string') {
          // 如果内容是字符串，转为文本消息
          if (messageContent.trim()) {
            normalizedContent.push({
              type: 'text',
              text: messageContent,
              uuid: uuid,
              parentUUID: data.parentUuid || null
            });
          }
        } else if (Array.isArray(messageContent)) {
          for (const c of messageContent) {
            if (c.type === 'tool_result') {
              let resultContent = data.toolUseResult || c.content;
              if (typeof resultContent !== 'string' && Array.isArray(resultContent)) {
                resultContent = resultContent[0]?.text || '';
              }
              
              normalizedContent.push({
                type: 'tool-result',
                tool_use_id: c.tool_use_id,
                content: resultContent,
                is_error: c.is_error || false,
                uuid: uuid,
                parentUUID: data.parentUuid || null,
                permissions: c.permissions ? {
                  date: c.permissions.date,
                  result: c.permissions.result,
                  mode: c.permissions.mode,
                  allowedTools: c.permissions.allowedTools,
                  decision: c.permissions.decision
                } : undefined
              });
            }
          }
        }
        
        // 如果没有解析出任何内容，返回 null
        if (normalizedContent.length === 0) {
          return null;
        }
        
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: data.isSidechain || false,
          content: normalizedContent,
          meta: raw.meta
        };
      }
    }
    
    // 处理 event 格式
    if (content.type === 'event') {
      return {
        id,
        localId,
        createdAt,
        role: 'event',
        content: content.data,
        isSidechain: false
      };
    }
    
    // 处理 codex 格式
    if (content.type === 'codex') {
      const data = content.data;
      
      console.log('[Normalizer] codex data:', {
        type: data?.type,
        callId: data?.callId,
        id: data?.id,
        name: data?.name
      });
      
      if (data?.type === 'message' || data?.type === 'reasoning') {
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: false,
          content: [{
            type: 'text',
            text: data.message,
            uuid: id,
            parentUUID: null
          }],
          meta: raw.meta
        };
      }
      
      if (data?.type === 'tool-call') {
        // 优先使用 callId，后备使用 id 或 tool_call_id
        const toolCallId = data.callId || data.id || data.tool_call_id || `tool-${Date.now()}`;
        console.log('[Normalizer] tool-call:', { toolCallId, name: data.name });
        
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: false,
          content: [{
            type: 'tool-call',
            id: toolCallId,
            name: data.name || 'unknown',
            input: data.input || data.arguments,
            description: null,
            uuid: data.id || id,
            parentUUID: null
          }],
          meta: raw.meta
        };
      }
      
      if (data?.type === 'tool-call-result') {
        // 优先使用 callId，后备使用 tool_call_id 或 id
        const toolUseId = data.callId || data.tool_call_id || data.id || `tool-${Date.now()}`;
        console.log('[Normalizer] tool-call-result:', { toolUseId, output: typeof data.output });
        
        return {
          id,
          localId,
          createdAt,
          role: 'agent',
          isSidechain: false,
          content: [{
            type: 'tool-result',
            tool_use_id: toolUseId,
            content: data.output || data.result,
            is_error: data.error || false,
            uuid: data.id || id,
            parentUUID: null
          }],
          meta: raw.meta
        };
      }
    }
  }

  // 处理 event 角色消息
  if (raw.role === 'event') {
    console.log('[Normalizer] Processing event message:', {
      contentType: typeof raw.content,
      content: raw.content
    });
    return {
      id,
      localId,
      createdAt,
      role: 'event',
      content: raw.content,
      isSidechain: false
    };
  }

  // 处理 user 消息中的乐观更新（本地发送的消息）
  // 这种消息通常没有 content 或 content 格式简单
  if (raw.role === 'user') {
    // 已经在上面处理过了，这里是 fallback
    console.log('[Normalizer] User message fallback:', raw);
    return null;
  }

  // 未知格式消息，记录日志
  console.log('[Normalizer] Unknown message format:', {
    role: raw.role,
    hasContent: !!raw.content,
    contentType: raw.content?.type,
    contentKeys: raw.content ? Object.keys(raw.content) : []
  });

  return null;
}

/**
 * 批量规范化消息
 * @param {Array} rawMessages - 原始消息数组
 * @returns {NormalizedMessage[]}
 */
function normalizeMessages(rawMessages, options = {}) {
  const results = [];
  const { skipOptimisticUserMessages = false } = options;
  
  for (const raw of rawMessages) {
    // 仅在实时消息处理时跳过乐观更新的用户消息（避免重复显示）
    // 历史消息加载时不跳过，因为它们需要被显示
    if (skipOptimisticUserMessages && raw.role === 'user' && !raw.messageId && !raw.id && !raw.content) {
      console.log('[Normalizer] Skipping optimistic user message:', raw.text?.substring(0, 50));
      continue;
    }
    
    // 为没有 id 的用户消息生成稳定的 ID（基于内容和时间戳）
    let id;
    if (raw.messageId || raw.id) {
      id = raw.messageId || raw.id;
    } else if (raw.role === 'user' && raw.text) {
      // 为乐观更新的用户消息生成稳定 ID，避免重复
      id = `user-${raw.timestamp || raw.createdAt || ''}-${raw.text.substring(0, 20).replace(/\s/g, '_')}`;
    } else {
      id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const localId = raw.localId || null;
    const createdAt = raw.createdAt ? 
      (typeof raw.createdAt === 'string' ? new Date(raw.createdAt).getTime() : raw.createdAt) : 
      (raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now());
    
    // 构造规范化输入
    const normalizeInput = {
      role: raw.role === 'assistant' ? 'agent' : raw.role,
      content: raw.content,
      meta: raw.meta,
      text: raw.text  // 保留 text 字段用于兼容
    };
    
    const normalized = normalizeRawMessage(id, localId, createdAt, normalizeInput);
    if (normalized) {
      results.push(normalized);
    }
  }
  
  return results;
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.MessageNormalizer = {
    normalizeRawMessage,
    normalizeMessages
  };
}
