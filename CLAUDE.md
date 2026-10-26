# Claude Code Configuration

## Email Automation Setup

This project is configured to automatically respond to emails from key contacts using Claude.

### Monitored Email Addresses

- **Bert**: dtrammell-bert@agentmail.to
- **Chief (Scribe)**: dtrammell-scribe@agentmail.to

### How It Works

The system monitors for emails from these addresses and automatically:
1. Detects emails with `[TASK]` in the subject line
2. Routes them to Claude for processing
3. Sends automated responses

### Configuration Files

- `.claude/settings.json` - Hook configuration and environment variables
- `scripts/email-monitor.sh` - Email monitoring and response logic

### Integration with Claude Sessions

When Claude Code sessions are active:
- The `on_message_submit` hook triggers after each message
- It checks for pending emails from Bert and Chief
- Responses are generated and sent automatically

### Current Automation Rules

1. **Task Detection**: Emails with `[TASK]` prefix are treated as executable jobs
2. **Priority Contacts**: Only Bert and Chief emails trigger automatic responses
3. **Response Format**: Standard acknowledgment + status update

### Manual Testing

To test the email monitoring:

```bash
./scripts/email-monitor.sh check-and-respond
```

### Environment Variables

```
BERT_EMAIL=dtrammell-bert@agentmail.to
CHIEF_EMAIL=dtrammell-scribe@agentmail.to
MONITOR_INTERVAL=300 (seconds)
```

### Future Enhancements

- [ ] Real-time email polling via Gmail API
- [ ] Custom response templates per sender
- [ ] Task priority assignment
- [ ] Automatic task creation in Notion
