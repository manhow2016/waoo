/**
 * 手动开通渠道
 *
 * 平台不代付、也不持有支付渠道凭证，因此默认渠道是「线下联系运营开通」：
 * 用户下单生成待支付订单，运营确认收款后通过 scripts/membership-admin.ts
 * 或管理后台按订单号开通。该渠道没有外部回调。
 */
import {
  PAYMENT_METHOD,
  type PaymentAdapter,
  type PaymentIntent,
} from './types'

export const manualPaymentAdapter: PaymentAdapter = {
  method: PAYMENT_METHOD.MANUAL,
  labelKey: 'paymentMethodManual',

  // 手动渠道不需要任何商户参数，永远就绪
  async isReady() {
    return true
  },

  async createPayment(): Promise<PaymentIntent> {
    return {
      method: PAYMENT_METHOD.MANUAL,
      // 需要运营确认收款，不能自动开通
      autoActivate: false,
      // 前端据此提示用户把订单号发给运营
      instructionsKey: 'paymentManualInstructions',
    }
  },

  async verifyWebhook() {
    // 手动开通不接收外部回调
    return null
  },
}
