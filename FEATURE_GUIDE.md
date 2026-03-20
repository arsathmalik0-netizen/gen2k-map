# Gen2K Marketing Console - Feature Guide

## Quick Reference for All Features

---

## 🎯 Message Variations (NEW!)

### What It Does
Creates multiple versions of your message by randomizing placeholder text, making each message unique to avoid spam detection.

### How to Use
1. In campaign creation modal, write your message with placeholders:
   ```
   {greeting} there! Check out our {product} - {offer}
   ```

2. The variations section appears automatically below the message box

3. For each placeholder, add multiple options:
   - **{greeting}**: "Hi", "Hello", "Hey"
   - **{product}**: "new service", "latest tool", "exclusive offer"
   - **{offer}**: "50% off today", "limited time deal", "special discount"

4. Click the "×" on any variation chip to remove it

5. Submit your campaign - each contact gets a randomized combination:
   - Contact 1: "Hi there! Check out our new service - 50% off today"
   - Contact 2: "Hello there! Check out our exclusive offer - special discount"
   - Contact 3: "Hey there! Check out our latest tool - limited time deal"

### Tips
- Use 3-5 variations per placeholder for best results
- Keep variations similar in tone and length
- Test your message with different combinations mentally before sending
- More variations = more unique messages = lower spam risk

---

## ✅ Contact Validation (NEW!)

### What It Does
Shows real-time feedback about your contact list - how many are valid, invalid, or duplicates.

### How to Use
1. Paste contacts in the "Target Contacts" field (one per line)
2. Wait half a second
3. See color-coded statistics appear below:
   - **Green (Valid)**: Numbers that will be sent to
   - **Red (Invalid)**: Numbers with wrong format (too short/long)
   - **Yellow (Duplicates)**: Numbers appearing more than once

### Supported Formats
All these work:
- `1234567890` (clean)
- `123 456 7890` (spaces)
- `123-456-7890` (dashes)
- `(123) 456-7890` (parentheses)

### What Gets Filtered
- Numbers less than 7 digits (too short)
- Numbers more than 15 digits (too long)
- Duplicate entries (only kept once)
- Non-numeric characters (automatically removed)

---

## 📊 Enhanced Logging Tab (NEW!)

### What It Does
View all system logs across all campaigns, devices, and operations in one place. Filter, search, export, and analyze everything that happens.

### How to Access
Click **"TERMINAL"** in the top navigation bar.

### Features

#### 1. Real-Time Logs
- See every action as it happens
- Color-coded by severity:
  - **Green**: Success messages
  - **Red**: Errors
  - **Yellow**: Warnings
  - **Cyan**: Informational
  - **Magenta**: Critical errors
- Auto-scrolls to newest entries

#### 2. Filters
- **Log Level**: Filter by DEBUG, INFO, SUCCESS, WARNING, ERROR, CRITICAL
- **Component**: Filter by System, SessionManager, CampaignManager, SendingEngine, WhatsApp, Storage, IPC
- **Search**: Type any text to find matching log entries (case-insensitive)
- **Refresh**: Click ⟳ icon to reload logs

#### 3. Statistics Dashboard
- **Total**: Total number of log entries
- **Errors**: Number of error-level logs
- **Critical**: Number of critical-level logs
- **Rate**: Success rate percentage

#### 4. Export Logs
- Click **"↓ EXPORT"** button
- Downloads all logs (or filtered logs) as JSON file
- Filename: `gen2k-logs-YYYY-MM-DD.json`
- Open in any text editor or JSON viewer

#### 5. Clear Logs
- Click **"✕ CLEAR"** button
- Requires confirmation
- Clears all log entries permanently
- Use to reset logs between testing sessions

### When to Use
- **Debugging**: Campaign not sending? Check logs for errors
- **Monitoring**: Watch real-time progress of active campaigns
- **Auditing**: Review what happened during a campaign
- **Troubleshooting**: Export logs to share with support
- **Performance**: Check success rates and error patterns

---

## 🖥️ Node Management (Devices)

### Add a Node
1. Click **"+ DEPLOY NODE"**
2. New device appears with status "QR Required"
3. Click **"ACCESS"** to open WhatsApp Web
4. Scan QR code with your phone
5. Status changes to "Active"
6. Device stays logged in permanently

### Node Actions
- **ACCESS**: Open WhatsApp Web window for this device
- **SYNC**: Refresh device status and reconnect if needed
- **PURGE**: Delete device and remove all session data

### Node Status Indicators
- **Active** (Green): Logged in and ready to send
- **Loading** (Yellow): Connecting to WhatsApp
- **QR Required** (Magenta): Needs QR code scan

### Visibility Indicator
- **Green dot**: Chat window is visible
- **Gray dot**: Chat window is hidden

---

## ⚡ Operation Management (Campaigns)

### Create Operation
1. Click **"+ NEW OPERATION"**
2. Fill out the form:
   - **Operation Name**: Descriptive name
   - **Message Template**: Your message (with {placeholders} optional)
   - **Message Variations**: Add variations for each placeholder
   - **Target Contacts**: One phone number per line
   - **Country Code**: Your country code (e.g., +1)
   - **Min/Max Delay**: Time between messages (30-60 seconds recommended)
   - **Select Active Nodes**: Choose devices to use
3. Click **"INITIALIZE"**

### View Operation Details
- Click any operation card
- See real-time statistics:
  - **TOTAL**: Total contacts
  - **SENT**: Successfully sent
  - **FAILED**: Failed to send
  - **PENDING**: Waiting in queue
- Watch progress bar fill up
- View live log of every message

### Control Operations
- **EXECUTE**: Start sending messages (DRAFT status only)
- **PAUSE**: Temporarily stop sending (resumes where it stopped)
- **RESUME**: Continue after pausing
- **TERMINATE**: Stop permanently (cannot be undone)

### Operation Status
- **Draft** (Gray): Created but not started
- **Running** (Green): Actively sending messages
- **Paused** (Yellow): Temporarily stopped
- **Stopped** (Red): Permanently terminated
- **Completed** (Red): All messages sent

---

## 🔧 Best Practices

### For Safety
1. **Use Multiple Devices**: Distribute load across 3-5 devices
2. **Conservative Delays**: 45-60 seconds between messages
3. **Test First**: Send to 5-10 contacts before full campaign
4. **Monitor Logs**: Watch for errors during sending
5. **Don't Spam**: Only send to opted-in contacts

### For Effectiveness
1. **Use Variations**: 3-5 options per placeholder
2. **Personalize Messages**: Include relevant information
3. **Validate Contacts**: Check feedback before sending
4. **Time Wisely**: Send during business hours
5. **Clear, Concise Messages**: Keep under 160 characters if possible

### For Reliability
1. **Keep App Open**: Don't close during campaigns
2. **Stable Internet**: Use wired connection if possible
3. **Established Accounts**: Use WhatsApp accounts 6+ months old
4. **Don't Overload**: Max 500 messages per device per day
5. **Export Logs**: Save logs after important campaigns

---

## 🎨 UI Reference

### Color Coding
- **Red/Crimson**: Primary actions, active elements, warnings
- **Green/Matrix**: Success, active devices, sent messages
- **Yellow/Amber**: Warnings, paused status, pending items
- **Magenta/Pink**: Errors, critical alerts, delete actions
- **Cyan/Blue**: Information, metadata, secondary elements

### Status Badges
- **Pulsing**: Active/running operation
- **Blinking**: Requires attention (QR code needed)
- **Solid**: Stable state
- **Glowing**: Interactive element (hover)

### Icons & Symbols
- **▣**: Nodes/Devices
- **⚡**: Operations/Campaigns
- **▤**: Logs/Terminal
- **>**: Command prompt indicator
- **◆**: Item marker
- **×**: Close/Remove
- **↓**: Download/Export
- **⟳**: Refresh/Reload

---

## 📝 Common Workflows

### Quick Send (No Variations)
1. Deploy 1-2 nodes
2. Create operation with simple message
3. Paste contacts
4. Set delays to 30-60 seconds
5. Execute
6. Monitor progress

### Professional Send (With Variations)
1. Deploy 3-5 nodes
2. Create operation with placeholder message
3. Add 3-5 variations per placeholder
4. Paste validated contact list
5. Set delays to 45-60 seconds
6. Execute
7. Switch to TERMINAL tab
8. Monitor logs in real-time
9. Export logs when complete

### Testing New Setup
1. Deploy 1 node
2. Create test operation with 5 contacts
3. Use short message
4. Set delays to 15-20 seconds (faster for testing)
5. Execute
6. Watch logs for errors
7. Verify messages arrived on test phones
8. If successful, scale up

### Troubleshooting Failed Campaign
1. Navigate to operation detail view
2. Check progress (how many sent before failure)
3. Switch to TERMINAL tab
4. Filter logs by ERROR level
5. Search for campaign name or device ID
6. Identify error type:
   - "Not on WhatsApp": Invalid numbers
   - "Failed to send": Connection issue
   - "Rate limited": Sending too fast
   - "Session expired": Need to re-login device
7. Take corrective action
8. Create new campaign with fixes

---

## 🚀 Performance Tips

### Speed vs Safety
- **Aggressive**: 15-30 sec delays, 1-2 devices = Fast but risky
- **Balanced**: 30-60 sec delays, 3-5 devices = Recommended
- **Conservative**: 60-120 sec delays, 5+ devices = Safest

### Time Estimates
| Contacts | Devices | Avg Delay | Total Time |
|----------|---------|-----------|------------|
| 100      | 1       | 45s       | ~1.2 hours |
| 100      | 5       | 45s       | ~15 mins   |
| 500      | 1       | 45s       | ~6 hours   |
| 500      | 5       | 45s       | ~1.2 hours |
| 1,000    | 5       | 45s       | ~2.5 hours |
| 5,000    | 5       | 45s       | ~12 hours  |

### Optimization Checklist
- ✅ Use multiple devices (3-5 ideal)
- ✅ Validate contacts first (remove invalid)
- ✅ Remove duplicates automatically
- ✅ Use established WhatsApp accounts
- ✅ Send during off-peak hours
- ✅ Keep internet connection stable
- ✅ Don't run other heavy apps
- ✅ Close unnecessary browser tabs

---

## ❓ FAQ

**Q: Do variations work automatically?**
A: Yes! Once you add variations, the system randomly selects from your options for each message automatically.

**Q: What happens if I close the app during a campaign?**
A: The queue is saved every 10 messages. When you reopen, the campaign auto-resumes from where it stopped.

**Q: Can I edit a campaign after creating it?**
A: No, campaigns are immutable snapshots. Delete and recreate if you need changes.

**Q: How do I know if a message was actually delivered?**
A: Check the logs - green "✓" means sent successfully. WhatsApp delivery receipts are not tracked.

**Q: What's the maximum number of devices I can use?**
A: Unlimited, but 3-5 is optimal. More devices = more management overhead.

**Q: Do I need WhatsApp Business API?**
A: No! This uses standard WhatsApp Web. No API keys or business accounts needed.

**Q: Can I send media (images, videos)?**
A: Not currently. Text messages only.

**Q: Will my accounts get banned?**
A: Possible if you: send too fast, send to random numbers, send spam content, use new accounts. Follow best practices to minimize risk.

**Q: Where is my data stored?**
A: Locally on your computer in the app's user data folder. Nothing is uploaded to any server.

**Q: Can I run this on a server/VPS?**
A: Yes, but it requires a display (X server on Linux). Headless mode not officially supported.

---

**For detailed technical documentation, see DOCUMENTATION.md**
**For implementation details, see IMPLEMENTATION_COMPLETE.md**
