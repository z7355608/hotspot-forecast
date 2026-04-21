import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Link to="/landing" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                AI
              </div>
              <span className="text-lg font-bold text-gray-900">爆款预测Agent</span>
            </Link>
          </div>
          <Link to="/landing" className="flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-28">
        <h1 className="text-3xl font-extrabold text-gray-900">服务条款</h1>
        <p className="mt-2 text-sm text-gray-400">最后更新日期：2026 年 3 月 26 日</p>
        <p className="mt-2 text-sm text-gray-400">生效日期：2026 年 3 月 26 日</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">一、总则</h2>
            <p>
              1.1 欢迎使用"爆款预测Agent"平台（以下简称"本平台"或"我们"）。本平台由峰极科技（以下简称"运营方"）运营和维护。在您注册、登录或以任何方式使用本平台提供的服务之前，请您仔细阅读并充分理解本服务条款（以下简称"本条款"）的全部内容。
            </p>
            <p className="mt-2">
              1.2 您一旦注册、登录或以其他方式使用本平台服务，即视为您已阅读、理解并同意接受本条款的约束。如您不同意本条款的任何内容，请立即停止使用本平台。
            </p>
            <p className="mt-2">
              1.3 本平台有权根据法律法规的变化、业务发展需要等原因不时修订本条款。修订后的条款将在本平台上公布，自公布之日起生效。您继续使用本平台服务即视为接受修订后的条款。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">二、服务内容</h2>
            <p>
              2.1 本平台是一款基于人工智能技术的内容创作辅助工具，主要提供以下服务：
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li>爆款内容预测与分析</li>
              <li>低粉爆款视频样本发现与拆解</li>
              <li>赛道智能监控与趋势预警</li>
              <li>AI 驱动的内容策略生成（包括但不限于翻拍脚本、文案模式提取、选题策略等）</li>
            </ul>
            <p className="mt-2">
              2.2 本平台提供的分析结果和建议仅供参考，不构成任何形式的投资建议、商业决策建议或法律建议。用户应自行判断并承担使用本平台服务所产生的风险和后果。
            </p>
            <p className="mt-2">
              2.3 本平台保留随时修改、暂停或终止部分或全部服务的权利，且无需事先通知用户。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">三、用户注册与账户管理</h2>
            <p>
              3.1 用户应使用真实、准确、完整的个人信息进行注册。用户注册时需提供有效的中国大陆手机号码，并通过短信验证码完成身份验证。
            </p>
            <p className="mt-2">
              3.2 用户应妥善保管其账户信息和登录密码，因用户自身原因导致的账户信息泄露、被盗用等后果由用户自行承担。
            </p>
            <p className="mt-2">
              3.3 每个手机号码仅能注册一个账户。用户不得将账户转让、出借、出租给他人使用。
            </p>
            <p className="mt-2">
              3.4 如发现任何未经授权使用您账户的情况，请立即通知我们。我们有权在调查期间暂停相关账户的使用。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">四、会员服务与积分规则</h2>
            <p>
              4.1 本平台提供免费版和付费会员（Plus 会员、Pro 会员）服务。各版本的具体功能权限和积分额度以平台页面展示为准。
            </p>
            <p className="mt-2">
              4.2 积分是本平台内的虚拟消费凭证，用于消费 AI 生成的深度内容服务。积分不可转让、不可提现、不可兑换为现金。
            </p>
            <p className="mt-2">
              4.3 付费会员的积分每月自动充值，未使用的积分不累积至下月。会员到期后，未使用的会员权益自动失效。
            </p>
            <p className="mt-2">
              4.4 用户可通过平台内的积分充值功能单独购买积分包。已购买的积分包不受会员周期限制，但自购买之日起 12 个月内未使用的积分将自动过期。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">五、付费与退款政策</h2>
            <p>
              5.1 用户通过本平台支持的支付方式完成付费即视为购买成功。支付完成后，相应的会员权益或积分将即时到账。
            </p>
            <p className="mt-2">
              5.2 会员订阅自动续费：连续包月会员按月自动续费，年付会员按年自动续费。用户可在会员到期前随时取消自动续费，取消后当前周期内的会员权益仍然有效。
            </p>
            <p className="mt-2">
              5.3 退款政策：首次订阅的用户可在订阅后 7 个自然日内申请全额退款，无需说明理由。退款将原路返回至支付账户，预计 3-7 个工作日到账。退款后，已使用的积分将从退款金额中扣除。
            </p>
            <p className="mt-2">
              5.4 以下情况不适用退款：（a）非首次订阅；（b）超过 7 天退款期限；（c）单独购买的积分包；（d）因违反本条款被封禁的账户。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">六、用户行为规范</h2>
            <p>用户在使用本平台服务时，应遵守以下规范：</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li>遵守中华人民共和国相关法律法规</li>
              <li>不得利用本平台从事任何违法违规活动</li>
              <li>不得利用技术手段干扰本平台的正常运行</li>
              <li>不得通过自动化工具、爬虫等方式批量获取本平台数据</li>
              <li>不得将本平台提供的数据和分析结果用于商业转售</li>
              <li>不得发布、传播违法、违规、侵权或不良信息</li>
              <li>不得侵犯他人的知识产权、隐私权等合法权益</li>
            </ul>
            <p className="mt-2">
              违反上述规范的，本平台有权立即暂停或终止用户的使用权限，并保留追究法律责任的权利。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">七、知识产权</h2>
            <p>
              7.1 本平台的所有内容，包括但不限于软件、界面设计、文字、图片、数据、算法模型等，均受中华人民共和国著作权法、商标法、专利法等知识产权法律法规的保护。
            </p>
            <p className="mt-2">
              7.2 用户通过本平台 AI 功能生成的内容（如翻拍脚本、文案分析等），用户享有合理使用权。但用户应自行确保其使用方式不侵犯第三方的合法权益。
            </p>
            <p className="mt-2">
              7.3 本平台展示的第三方视频数据（包括标题、封面、播放数据等）仅用于数据分析目的，相关内容的知识产权归原创作者所有。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">八、免责声明</h2>
            <p>
              8.1 本平台基于公开可获取的数据和 AI 算法提供分析服务，不保证分析结果的绝对准确性、完整性和时效性。
            </p>
            <p className="mt-2">
              8.2 因不可抗力（包括但不限于自然灾害、政府行为、网络攻击、系统故障等）导致的服务中断或数据损失，本平台不承担责任。
            </p>
            <p className="mt-2">
              8.3 用户基于本平台提供的分析结果所做出的任何决策及其后果，由用户自行承担。
            </p>
            <p className="mt-2">
              8.4 本平台不对第三方平台（如抖音、小红书等）的数据准确性和可用性做出保证。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">九、争议解决</h2>
            <p>
              9.1 本条款的订立、执行和解释及争议的解决均应适用中华人民共和国法律（不包括港澳台地区法律）。
            </p>
            <p className="mt-2">
              9.2 因本条款产生的或与本条款有关的任何争议，双方应首先通过友好协商解决。协商不成的，任何一方均有权向运营方所在地有管辖权的人民法院提起诉讼。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">十、其他</h2>
            <p>
              10.1 本条款中的任何条款如因任何原因被认定为无效或不可执行，其余条款仍然有效。
            </p>
            <p className="mt-2">
              10.2 本平台未行使或延迟行使本条款项下的任何权利，不构成对该权利的放弃。
            </p>
            <p className="mt-2">
              10.3 如您对本条款有任何疑问，请通过平台内的"联系我们"功能与我们取得联系。
            </p>
          </section>
        </div>

        <div className="mt-12 rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-500">
          <p>如有疑问，请联系我们：support@fengji.tech</p>
          <p className="mt-1">峰极科技 版权所有 © {new Date().getFullYear()}</p>
        </div>
      </main>
    </div>
  );
}
