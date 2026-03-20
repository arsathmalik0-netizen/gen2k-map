import { BrowserWindow } from 'electron';

export class WhatsAppSender {
  private browserWindow: BrowserWindow;

  constructor(browserWindow: BrowserWindow) {
    this.browserWindow = browserWindow;
  }

  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    try {
      await this.openChat(phoneNumber);
      await this.waitForChatLoad();
      await this.typeMessage(message);
      await this.clickSendButton();
      await this.waitForDelivery();

      return true;
    } catch (error) {
      console.error(`Failed to send message to ${phoneNumber}:`, error);
      throw error;
    }
  }

  private async openChat(phoneNumber: string): Promise<void> {
    const url = `https://web.whatsapp.com/send?phone=${phoneNumber}`;

    await this.browserWindow.loadURL(url);
    await this.delay(3000);
  }

  private async waitForChatLoad(): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const isLoaded = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          const chatExists = document.querySelector('div[contenteditable="true"][data-tab="10"]') !== null;
          const invalidNumber = document.querySelector('div[data-testid="invalid-number"]') !== null;
          const notOnWhatsApp = document.body.innerText.includes('phone number is not on WhatsApp') ||
                                document.body.innerText.includes('This phone number is not registered');

          if (invalidNumber || notOnWhatsApp) {
            return 'INVALID';
          }

          return chatExists ? 'LOADED' : 'WAITING';
        })();
      `);

      if (isLoaded === 'INVALID') {
        throw new Error('NUMBER_NOT_ON_WHATSAPP');
      }

      if (isLoaded === 'LOADED') {
        return;
      }

      await this.delay(1000);
      attempts++;
    }

    throw new Error('CHAT_LOAD_TIMEOUT');
  }

  private async typeMessage(message: string): Promise<void> {
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    await this.browserWindow.webContents.executeJavaScript(`
      (function() {
        const inputBox = document.querySelector('div[contenteditable="true"][data-tab="10"]');
        if (!inputBox) {
          throw new Error('Input box not found');
        }

        inputBox.focus();

        const lines = \`${escapedMessage}\`.split('\\n');
        for (let i = 0; i < lines.length; i++) {
          document.execCommand('insertText', false, lines[i]);
          if (i < lines.length - 1) {
            document.execCommand('insertLineBreak');
          }
        }

        return true;
      })();
    `);

    await this.delay(500);
  }

  private async clickSendButton(): Promise<void> {
    const clicked = await this.browserWindow.webContents.executeJavaScript(`
      (function() {
        const sendButton = document.querySelector('button[data-testid="compose-btn-send"]') ||
                          document.querySelector('span[data-icon="send"]')?.parentElement?.parentElement;

        if (!sendButton) {
          throw new Error('Send button not found');
        }

        sendButton.click();
        return true;
      })();
    `);

    if (!clicked) {
      throw new Error('SEND_BUTTON_NOT_CLICKED');
    }

    await this.delay(1000);
  }

  private async waitForDelivery(): Promise<void> {
    const maxWait = 10;
    let waited = 0;

    while (waited < maxWait) {
      const delivered = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          const messages = document.querySelectorAll('div[data-testid="msg-container"]');
          if (messages.length === 0) return false;

          const lastMessage = messages[messages.length - 1];
          const hasSingleCheck = lastMessage.querySelector('span[data-icon="msg-check"]') !== null;
          const hasDoubleCheck = lastMessage.querySelector('span[data-icon="msg-dblcheck"]') !== null;

          return hasSingleCheck || hasDoubleCheck;
        })();
      `);

      if (delivered) {
        return;
      }

      await this.delay(1000);
      waited++;
    }

    console.warn('Message may not have been delivered (timeout waiting for check marks)');
  }

  async isWhatsAppReady(): Promise<boolean> {
    try {
      const ready = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          return document.querySelector('div[contenteditable="true"][data-tab="10"]') !== null ||
                 document.querySelector('canvas[aria-label="Scan me!"]') === null;
        })();
      `);

      return ready;
    } catch (error) {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
