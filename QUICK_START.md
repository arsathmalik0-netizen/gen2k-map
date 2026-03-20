# Gen2K Marketing Console - Quick Start Guide

## 🚀 Getting Started (5 Minutes)

### 1. Installation (1 minute)
```bash
npm install
npm run compile
```

### 2. Launch Application (30 seconds)
```bash
npm start
```

**Application opens with red-themed dashboard**

---

## 📱 Add Your First Device (2 minutes)

1. Click **"ADD DEVICE"** button (top right)
2. A browser window opens with WhatsApp Web
3. **Scan the QR code** with your phone:
   - Open WhatsApp on phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Point camera at QR code
4. Window automatically hides
5. Device shows as **"Active"** with green badge

**✅ Your device is now ready to send messages!**

---

## 📨 Create Your First Campaign (2 minutes)

1. Click **"CAMPAIGNS"** tab in navigation
2. Click **"CREATE CAMPAIGN"** button
3. Fill in the form:

   **Campaign Name**
   ```
   My First Campaign
   ```

   **Message Template**
   ```
   Hello! This is a test message from Gen2K Marketing Console.
   ```

   **Contact Numbers** (one per line)
   ```
   1234567890
   9876543210
   5555555555
   ```

   **Country Code**
   ```
   +1
   ```

   **Delays** (recommended defaults already set)
   ```
   Min: 30 seconds
   Max: 60 seconds
   ```

   **Select Devices**
   - ✅ All active devices are pre-selected

4. Click **"CREATE CAMPAIGN"**

**✅ Campaign created and appears in your campaigns list!**

---

## ▶️ Run Your Campaign (1 minute)

1. **Click on your campaign card** to open details
2. Review the statistics:
   - Total contacts
   - Current status (Draft)
3. Click **"START"** button
4. Confirm the action
5. **Watch it work!**
   - Status changes to "Running"
   - Progress bar advances
   - Logs appear in real-time
   - Stats update live

**✅ Messages are being sent automatically!**

---

## 🎛️ Campaign Controls

### During Campaign

**PAUSE** - Temporarily stop sending
- Current message completes
- Progress is saved
- Can resume anytime

**RESUME** - Continue sending
- Picks up where it left off
- No duplicate messages

**STOP** - Permanently end campaign
- Cannot be resumed
- Final stats saved

---

## 📊 Understanding The Dashboard

### Sessions Tab
- **Green Badge**: Device is active and ready
- **Yellow Badge**: Device is loading
- **Red Badge**: Needs QR code login
- **Green Dot**: Window is visible
- **Gray Dot**: Running in background

### Campaigns Tab
- **Gray Badge**: Draft (not started)
- **Green Badge + Pulse**: Running
- **Yellow Badge**: Paused
- **Red Badge**: Stopped or Completed

### Campaign Detail View
- **TOTAL**: How many contacts
- **SENT**: Successfully delivered
- **FAILED**: Could not send
- **PENDING**: Waiting to send
- **Progress Bar**: Visual completion
- **Log Panel**: Real-time activity

---

## 💡 Pro Tips

### For Best Results

1. **Use Multiple Devices**
   - Faster sending
   - Better distribution
   - Higher reliability

2. **Respect Delays**
   - Minimum 30 seconds recommended
   - Higher delays = safer accounts
   - Don't go below 15 seconds

3. **Test First**
   - Send to your own number first
   - Verify message format
   - Check links work

4. **Monitor Logs**
   - Watch for errors
   - Check delivery status
   - Catch issues early

5. **Keep App Running**
   - Don't minimize during campaigns
   - Internet must stay connected
   - Device stays logged in

---

## ⚠️ Common Issues & Solutions

### "No active devices available"
**Solution**: Add a device and scan QR code

### "Failed to send message"
**Solution**: Check device is still logged in, refresh if needed

### "Number not on WhatsApp"
**Solution**: Normal - number is skipped automatically

### Device shows "QR Required"
**Solution**: Click "Refresh" then scan new QR code

### Campaign stuck at 0%
**Solution**: Check logs for errors, ensure devices are active

---

## 🔄 Typical Workflow

```
Morning:
1. Open app → Devices auto-connect
2. Create campaign → Upload contacts
3. Start campaign → Let it run

Throughout Day:
4. Check progress periodically
5. Monitor logs for issues
6. Add more devices if needed

Evening:
7. Review completion stats
8. Check final logs
9. Plan next campaign
```

---

## ⏱️ Time Estimates

### Sending Speed (Single Device)
- 30-60 second delays
- ~60-120 messages per hour
- ~500 messages in 8 hours
- ~1000 messages in 16 hours

### Multiple Devices (5 Devices)
- Same delays per device
- ~300-600 messages per hour
- ~2500 messages in 8 hours
- ~5000 messages in 16 hours

---

## 🎯 Quick Commands

### Start Application
```bash
npm start
```

### Rebuild After Changes
```bash
npm run compile
npm start
```

### Build for Distribution
```bash
npm run build
```

---

## 📞 Support Checklist

Before asking for help:

- ✅ Is the app running?
- ✅ Are devices showing as Active?
- ✅ Is internet connected?
- ✅ Did you scan the QR code?
- ✅ Are there contacts in the campaign?
- ✅ Check the log panel for errors

---

## 🎓 Learning Path

### Beginner (Day 1)
1. Add one device
2. Create test campaign (3 numbers)
3. Start and watch completion

### Intermediate (Week 1)
1. Add multiple devices
2. Larger campaigns (50+ contacts)
3. Use pause/resume

### Advanced (Month 1)
1. Multiple simultaneous campaigns
2. Different devices for different campaigns
3. Optimize delays based on results

---

## ✅ Success Indicators

You know it's working when:
- ✅ Green badges on devices
- ✅ Progress bar moving
- ✅ Green logs appearing
- ✅ "Sent" counter increasing
- ✅ Phone receives test message

---

## 🚨 Red Flags

Stop and investigate if:
- ❌ All messages failing
- ❌ Device going offline repeatedly
- ❌ Progress stuck for 5+ minutes
- ❌ Many "number not on WhatsApp" errors
- ❌ App crashing

---

## 🎉 You're Ready!

With this guide, you can:
- Add devices
- Create campaigns
- Send messages
- Monitor progress
- Troubleshoot issues

**Start with a small test campaign and scale up as you get comfortable.**

---

*For detailed information, see DOCUMENTATION.md*
*For technical details, see FINAL_VERIFICATION.md*
*For completion status, see COMPLETION_SUMMARY.md*
