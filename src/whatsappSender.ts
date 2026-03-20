import { BrowserWindow } from 'electron';

export type ErrorType = 'PERMANENT' | 'TEMPORARY' | 'RATE_LIMIT' | 'SESSION' | 'NETWORK' | 'UNKNOWN';

export interface SendError extends Error {
  type: ErrorType;
  retryable: boolean;
  retryAfter?: number;
}

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
    try {
      const navigated = await this.navigateViaSearch(phoneNumber);

      if (!navigated) {
        console.warn('Search navigation failed, falling back to URL method');
        await this.navigateViaURL(phoneNumber);
      }
    } catch (error) {
      console.error('Chat navigation failed:', error);
      throw this.createError('Failed to open chat', 'TEMPORARY', true);
    }
  }

  private async navigateViaSearch(phoneNumber: string): Promise<boolean> {
    try {
      const success = await this.browserWindow.webContents.executeJavaScript(`
        (async function() {
          const searchBox = document.querySelector('div[contenteditable="true"][data-tab="3"]') ||
                           document.querySelector('div[role="textbox"][title*="Search"]');

          if (!searchBox) return false;

          searchBox.focus();
          document.execCommand('selectAll');
          document.execCommand('insertText', false, '${phoneNumber}');

          await new Promise(resolve => setTimeout(resolve, 2000));

          const searchResults = document.querySelectorAll('div[role="listitem"]') ||
                               document.querySelectorAll('div[data-testid="cell-frame-container"]');

          if (searchResults.length > 0) {
            searchResults[0].click();
            return true;
          }

          return false;
        })();
      `);

      if (success) {
        await this.delay(2000);
      }

      return success;
    } catch (error) {
      console.error('Search navigation error:', error);
      return false;
    }
  }

  private async navigateViaURL(phoneNumber: string): Promise<void> {
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

          const invalidNumber =
            document.querySelector('div[data-testid="invalid-number"]') !== null ||
            document.querySelector('[data-testid="phone-number-invalid"]') !== null ||
            document.body.innerText.includes('phone number is not on WhatsApp') ||
            document.body.innerText.includes('This phone number is not registered') ||
            document.body.innerText.includes('número de teléfono no está en WhatsApp') ||
            document.body.innerText.includes('número não está no WhatsApp') ||
            document.body.innerText.includes('not a valid') ||
            !!document.querySelector('div[role="dialog"]')?.innerText.match(/invalid|not.*whatsapp|no.*registrado/i);

          if (invalidNumber) {
            return 'INVALID';
          }

          return chatExists ? 'LOADED' : 'WAITING';
        })();
      `);

      if (isLoaded === 'INVALID') {
        throw this.createError('NUMBER_NOT_ON_WHATSAPP', 'PERMANENT', false);
      }

      if (isLoaded === 'LOADED') {
        return;
      }

      await this.delay(1000);
      attempts++;
    }

    throw this.createError('CHAT_LOAD_TIMEOUT', 'TEMPORARY', true);
  }

  private async typeMessage(message: string): Promise<void> {
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const typed = await this.browserWindow.webContents.executeJavaScript(`
      (function() {
        const selectors = [
          'div[contenteditable="true"][data-tab="10"]',
          'div[contenteditable="true"][data-lexical-editor="true"]',
          'div[role="textbox"][contenteditable="true"]',
          'div[contenteditable="true"][title*="Type a message"]',
          'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
          'footer div[contenteditable="true"]',
          'div.copyable-text[contenteditable="true"]',
          'div[spellcheck="true"][contenteditable="true"]'
        ];

        let inputBox = null;

        for (const selector of selectors) {
          inputBox = document.querySelector(selector);
          if (inputBox) break;
        }

        if (!inputBox) {
          const allEditables = document.querySelectorAll('div[contenteditable="true"]');
          for (const elem of allEditables) {
            const rect = elem.getBoundingClientRect();
            if (rect.bottom > window.innerHeight * 0.7 && rect.width > 200) {
              inputBox = elem;
              break;
            }
          }
        }

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

    if (!typed) {
      throw this.createError('Failed to type message', 'TEMPORARY', true);
    }

    await this.delay(500);
  }

  private async clickSendButton(): Promise<void> {
    const clicked = await this.browserWindow.webContents.executeJavaScript(`
      (function() {
        const selectors = [
          'button[data-testid="compose-btn-send"]',
          'button[aria-label*="Send"]',
          'span[data-icon="send"]',
          'button[data-tab="11"]',
          'footer button[aria-label]',
        ];

        let sendButton = null;

        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem) {
            sendButton = elem.tagName === 'BUTTON' ? elem : elem.closest('button');
            if (sendButton && !sendButton.disabled) break;
          }
        }

        if (!sendButton) {
          const allButtons = document.querySelectorAll('footer button, footer span[data-icon]');
          for (const btn of allButtons) {
            const ariaLabel = btn.getAttribute('aria-label') || '';
            if (ariaLabel.toLowerCase().includes('send') ||
                ariaLabel.toLowerCase().includes('enviar') ||
                btn.querySelector('span[data-icon="send"]')) {
              sendButton = btn.tagName === 'BUTTON' ? btn : btn.closest('button');
              if (sendButton && !sendButton.disabled) break;
            }
          }
        }

        if (!sendButton) {
          const svgs = document.querySelectorAll('footer svg');
          for (const svg of svgs) {
            const path = svg.querySelector('path');
            if (path && path.getAttribute('d')?.includes('M1.101,21.757')) {
              sendButton = svg.closest('button');
              if (sendButton && !sendButton.disabled) break;
            }
          }
        }

        if (!sendButton) {
          const footerButtons = document.querySelectorAll('footer button');
          for (const btn of footerButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.right > window.innerWidth * 0.9 && rect.bottom > window.innerHeight * 0.8) {
              if (!btn.disabled) {
                sendButton = btn;
                break;
              }
            }
          }
        }

        if (!sendButton || sendButton.disabled) {
          throw new Error('Send button not found or disabled');
        }

        sendButton.click();
        return true;
      })();
    `);

    if (!clicked) {
      throw this.createError('SEND_BUTTON_NOT_CLICKED', 'TEMPORARY', true);
    }

    await this.delay(1000);
  }

  private async waitForDelivery(): Promise<void> {
    const maxWait = 30;
    let waited = 0;

    while (waited < maxWait) {
      const delivered = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          const messages = document.querySelectorAll('div[data-testid="msg-container"]');
          if (messages.length === 0) return false;

          const lastMessage = messages[messages.length - 1];
          const hasSingleCheck = lastMessage.querySelector('span[data-icon="msg-check"]') !== null;
          const hasDoubleCheck = lastMessage.querySelector('span[data-icon="msg-dblcheck"]') !== null;
          const hasDoubleCheckBlue = lastMessage.querySelector('span[data-icon="msg-dblcheck-blue"]') !== null;
          const hasClock = lastMessage.querySelector('span[data-icon="msg-time"]') !== null;

          return hasSingleCheck || hasDoubleCheck || hasDoubleCheckBlue || hasClock;
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

  async checkNetworkConnectivity(): Promise<boolean> {
    try {
      const isOnline = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          if (!navigator.onLine) return false;

          const offlineIndicator = document.querySelector('div[data-testid="alert-phone-offline"]') ||
                                   document.body.innerText.includes('Computer not connected') ||
                                   document.body.innerText.includes('Trying to reach phone');

          return !offlineIndicator;
        })();
      `);

      return isOnline;
    } catch (error) {
      return false;
    }
  }

  async detectRateLimit(): Promise<boolean> {
    try {
      const rateLimited = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          return document.body.innerText.includes('too many messages') ||
                 document.body.innerText.includes('slow down') ||
                 document.body.innerText.includes('temporarily unavailable') ||
                 document.querySelector('div[data-testid="rate-limit"]') !== null;
        })();
      `);

      return rateLimited;
    } catch (error) {
      return false;
    }
  }

  private createError(message: string, type: ErrorType, retryable: boolean, retryAfter?: number): SendError {
    const error = new Error(message) as SendError;
    error.type = type;
    error.retryable = retryable;
    error.retryAfter = retryAfter;
    return error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
