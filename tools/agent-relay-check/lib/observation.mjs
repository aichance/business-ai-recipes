// An ordered, single-turn observer. Metadata/progress notifications do not count
// as receipt evidence. Every unknown item is treated as tool activity.
export class TurnObservation {
  constructor(threadId) {
    this.threadId = threadId;
    this.turnId = null;
    this.state = 'awaiting';
    this.tools = new Set();
    this.result = {completed: false, protocol_error: false, message: '', tool_calls: 0};
  }
  accept({method, params}) {
    if (method === 'error') { this.result.protocol_error = true; return; }
    if (!['turn/started', 'turn/completed', 'item/started', 'item/completed'].includes(method)) return;
    if (!params || params.threadId !== this.threadId) { this.result.protocol_error = true; return; }
    const turnId = params.turnId ?? params.turn?.id;
    if (typeof turnId !== 'string' || this.turnId && this.turnId !== turnId) { this.result.protocol_error = true; return; }
    if (method === 'turn/started') {
      if (this.state !== 'awaiting') { this.result.protocol_error = true; return; }
      this.turnId = turnId;
      this.state = 'running';
      return;
    }
    if (this.state !== 'running') { this.result.protocol_error = true; return; }
    if (method === 'turn/completed') {
      this.state = 'completed';
      this.result.completed = params.turn.status === 'completed';
      return;
    }
    const item = params.item;
    if (!item || typeof item.type !== 'string') { this.result.protocol_error = true; return; }
    if (item.type === 'agentMessage' && method === 'item/completed') {
      if (typeof item.text !== 'string') this.result.protocol_error = true;
      else this.result.message = item.text;
    } else if (!['agentMessage', 'userMessage', 'reasoning'].includes(item.type)) {
      this.tools.add(item.id ?? item.type);
      this.result.tool_calls = this.tools.size;
    }
  }
}
