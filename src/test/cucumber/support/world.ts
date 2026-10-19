import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { PaymentPage } from '../../pages/payment.page';
import { TEST_CONFIG } from '../../config/test-env';

export interface ApiResponse {
  status: number;
  body: any;
}

export interface PaymentContextData {
  id: string;
  amountMinor: number;
  currency: string;
  recipient: string;
  idempotencyKey?: string;
}

/**
 * Custom World holding scenario state, HTTP client helpers,
 * and Playwright browser lifecycle objects.
 */
export class CustomWorld extends World {
  public apiKey: string;
  public lastResponse: ApiResponse | null = null;
  public originalPayment: PaymentContextData | null = null;

  // Optional Playwright browser instances for UI scenarios
  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  public page: Page | null = null;
  public paymentPage: PaymentPage | null = null;

  constructor(options: IWorldOptions) {
    super(options);
    this.apiKey = TEST_CONFIG.apiKey;
  }

  /**
   * Initializes a Playwright browser instance and page object.
   */
  async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({ baseURL: TEST_CONFIG.baseURL });
      this.page = await this.context.newPage();
      this.paymentPage = new PaymentPage(this.page);
    }
  }

  /**
   * Closes the browser and context after scenario execution.
   */
  async closeBrowser(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
    this.paymentPage = null;
  }
}

setWorldConstructor(CustomWorld);
