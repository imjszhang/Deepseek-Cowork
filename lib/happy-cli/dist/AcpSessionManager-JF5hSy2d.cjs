'use strict';

var cuid2 = require('@paralleldrive/cuid2');
var happyWire = require('@slopus/happy-wire');

function turnOptions(turnId, time) {
  return turnId ? { turn: turnId, time } : { time };
}
function buildToolTitle(toolName) {
  return toolName;
}
function buildToolDescription(toolName) {
  return `Running ${toolName}`;
}
function parseThinkingPayload(payload) {
  if (typeof payload === "string") {
    return { text: payload, streaming: false };
  }
  if (!payload || typeof payload !== "object") {
    return { text: "", streaming: false };
  }
  const text = typeof payload.text === "string" ? payload.text : "";
  const streaming = payload.streaming === true;
  return { text, streaming };
}
class AcpSessionManager {
  currentTurnId = null;
  acpCallToSessionCall = /* @__PURE__ */ new Map();
  /** Monotonic clock: max(lastTime + 1, Date.now()) */
  lastTime = 0;
  /** Pending text waiting to be flushed when the stream type changes */
  pendingText = "";
  pendingType = null;
  nextTime() {
    this.lastTime = Math.max(this.lastTime + 1, Date.now());
    return this.lastTime;
  }
  ensureSessionCallId(acpCallId) {
    const existing = this.acpCallToSessionCall.get(acpCallId);
    if (existing) {
      return existing;
    }
    const created = cuid2.createId();
    this.acpCallToSessionCall.set(acpCallId, created);
    return created;
  }
  flush() {
    if (!this.pendingText || !this.pendingType) {
      return [];
    }
    const text = this.pendingText.replace(/^\n+|\n+$/g, "");
    const type = this.pendingType;
    this.pendingText = "";
    this.pendingType = null;
    if (!text) {
      return [];
    }
    if (type === "thinking") {
      return [happyWire.createEnvelope("agent", { t: "text", text, thinking: true }, turnOptions(this.currentTurnId, this.nextTime()))];
    }
    return [happyWire.createEnvelope("agent", { t: "text", text }, turnOptions(this.currentTurnId, this.nextTime()))];
  }
  startTurn() {
    if (this.currentTurnId) {
      return [];
    }
    this.currentTurnId = cuid2.createId();
    this.acpCallToSessionCall.clear();
    return [
      happyWire.createEnvelope("agent", { t: "turn-start" }, { turn: this.currentTurnId, time: this.nextTime() })
    ];
  }
  endTurn(status) {
    const flushed = this.flush();
    if (!this.currentTurnId) {
      return flushed;
    }
    const turnId = this.currentTurnId;
    this.currentTurnId = null;
    this.acpCallToSessionCall.clear();
    return [
      ...flushed,
      happyWire.createEnvelope("agent", { t: "turn-end", status }, { turn: turnId, time: this.nextTime() })
    ];
  }
  mapMessage(msg) {
    if (msg.type === "event" && msg.name === "thinking") {
      const { text, streaming } = parseThinkingPayload(msg.payload);
      if (!text) {
        return [];
      }
      if (streaming) {
        const flushed = this.pendingType !== "thinking" ? this.flush() : [];
        this.pendingType = "thinking";
        this.pendingText += text;
        return flushed;
      }
      const trimmed = text.replace(/^\n+|\n+$/g, "");
      if (!trimmed) {
        return this.flush();
      }
      return [
        ...this.flush(),
        happyWire.createEnvelope("agent", { t: "text", text: trimmed, thinking: true }, turnOptions(this.currentTurnId, this.nextTime()))
      ];
    }
    if (msg.type === "status") {
      return [];
    }
    if (msg.type === "model-output") {
      const text = msg.textDelta ?? "";
      if (!text) {
        return [];
      }
      const flushed = this.pendingType !== "output" ? this.flush() : [];
      this.pendingType = "output";
      this.pendingText += text;
      return flushed;
    }
    if (msg.type === "tool-call") {
      const flushed = this.flush();
      const call = this.ensureSessionCallId(msg.callId);
      return [
        ...flushed,
        happyWire.createEnvelope("agent", {
          t: "tool-call-start",
          call,
          name: msg.toolName,
          title: buildToolTitle(msg.toolName),
          description: buildToolDescription(msg.toolName),
          args: msg.args
        }, turnOptions(this.currentTurnId, this.nextTime()))
      ];
    }
    if (msg.type === "tool-result") {
      const flushed = this.flush();
      const call = this.ensureSessionCallId(msg.callId);
      return [
        ...flushed,
        happyWire.createEnvelope("agent", { t: "tool-call-end", call }, turnOptions(this.currentTurnId, this.nextTime()))
      ];
    }
    return [];
  }
}

exports.AcpSessionManager = AcpSessionManager;
