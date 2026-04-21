import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function PrivacyPage() {
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
        <h1 className="text-3xl font-extrabold text-gray-900">隐私政策</h1>
        <p className="mt-2 text-sm text-gray-400">最后更新日期：2026 年 3 月 26 日</p>
        <p className="mt-2 text-sm text-gray-400">生效日期：2026 年 3 月 26 日</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-gray-600">
          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">一、引言</h2>
            <p>
              峰极科技（以下简称"我们"）深知个人信息对您的重要性，我们将按照法律法规的规定，采取相应的安全保护措施，尽力保护您的个人信息安全可控。本隐私政策适用于"爆款预测Agent"平台（以下简称"本平台"）提供的所有服务。
            </p>
            <p className="mt-2">
              请您在使用本平台服务前，仔细阅读并充分理解本隐私政策的全部内容。一旦您开始使用本平台服务，即表示您已充分理解并同意本政策。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">二、我们收集的信息</h2>
            <p>为向您提供服务，我们可能需要收集以下信息：</p>

            <h3 className="mb-2 mt-4 font-semibold text-gray-800">2.1 您主动提供的信息</h3>
            <ul className="list-inside list-disc space-y-1 pl-4">
              <li><strong>注册信息</strong>：手机号码（用于账户注册和身份验证）</li>
              <li><strong>账户信息</strong>：您设置的登录密码（经加密存储）、昵称</li>
              <li><strong>个性化偏好</strong>：您选择的内容赛道、关注平台、粉丝规模等创作画像信息</li>
              <li><strong>使用输入</strong>：您在使用爆款预测等功能时输入的查询内容和指令</li>
            </ul>

            <h3 className="mb-2 mt-4 font-semibold text-gray-800">2.2 我们自动收集的信息</h3>
            <ul className="list-inside list-disc space-y-1 pl-4">
              <li><strong>设备信息</strong>：设备型号、操作系统版本、浏览器类型和版本、屏幕分辨率</li>
              <li><strong>日志信息</strong>：访问时间、访问页面、IP 地址、请求来源</li>
              <li><strong>使用数据</strong>：功能使用频率、积分消耗记录、会员订阅状态</li>
              <li><strong>Cookie 和类似技术</strong>：用于维持登录状态和改善用户体验</li>
            </ul>

            <h3 className="mb-2 mt-4 font-semibold text-gray-800">2.3 我们不收集的信息</h3>
            <ul className="list-inside list-disc space-y-1 pl-4">
              <li>我们不收集您的身份证号码、银行卡号等敏感金融信息（支付由第三方支付平台处理）</li>
              <li>我们不收集您的精确地理位置信息</li>
              <li>我们不收集您设备上的通讯录、相册、短信等个人数据</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">三、信息使用目的</h2>
            <p>我们收集的信息将用于以下目的：</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li><strong>提供核心服务</strong>：包括用户身份验证、爆款预测分析、低粉爆款发现、智能监控等功能</li>
              <li><strong>个性化体验</strong>：根据您的创作画像和使用偏好，提供更精准的内容推荐和分析结果</li>
              <li><strong>账户管理</strong>：管理您的会员状态、积分余额、订阅续费等</li>
              <li><strong>安全保障</strong>：识别和防范安全风险，保护您的账户安全</li>
              <li><strong>服务改进</strong>：分析使用数据以优化产品功能和用户体验</li>
              <li><strong>通知推送</strong>：向您发送服务通知、功能更新、安全提醒等信息（您可在设置中关闭）</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">四、信息存储与安全</h2>
            <p>
              4.1 <strong>存储地点</strong>：您的个人信息存储在中华人民共和国境内的服务器上。我们不会将您的个人信息传输至境外。
            </p>
            <p className="mt-2">
              4.2 <strong>存储期限</strong>：我们仅在为您提供服务所必需的期间内保留您的个人信息。账户注销后，我们将在 30 个自然日内删除或匿名化处理您的个人信息，法律法规另有规定的除外。
            </p>
            <p className="mt-2">
              4.3 <strong>安全措施</strong>：我们采取以下技术和管理措施保护您的信息安全：
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li>用户密码采用 bcrypt 等行业标准算法加密存储，任何人（包括我们的员工）均无法获取您的明文密码</li>
              <li>数据传输全程采用 HTTPS/TLS 加密</li>
              <li>服务器部署在阿里云等具备等保三级资质的云服务平台</li>
              <li>实施严格的数据访问权限控制和审计机制</li>
              <li>定期进行安全漏洞扫描和渗透测试</li>
            </ul>
            <p className="mt-2">
              4.4 <strong>安全事件</strong>：如发生个人信息安全事件，我们将按照法律法规的要求及时向您告知事件的基本情况、影响、已采取的处置措施和补救措施，以及我们对您的建议。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">五、信息共享与披露</h2>
            <p>
              5.1 我们不会向第三方出售您的个人信息。
            </p>
            <p className="mt-2">
              5.2 在以下情况下，我们可能会共享您的部分信息：
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li><strong>支付处理</strong>：与第三方支付平台（如支付宝、微信支付）共享必要的交易信息以完成支付</li>
              <li><strong>短信服务</strong>：与阿里云短信服务共享您的手机号码以发送验证码</li>
              <li><strong>法律要求</strong>：根据法律法规、法律程序、诉讼或政府主管部门的强制性要求</li>
              <li><strong>权益保护</strong>：为保护我们、用户或公众的权利、财产或安全所必需</li>
            </ul>
            <p className="mt-2">
              5.3 我们与第三方服务提供商签订严格的数据保护协议，要求其按照本隐私政策和相关法律法规的要求处理您的个人信息。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">六、Cookie 和类似技术</h2>
            <p>
              6.1 我们使用 Cookie 和 localStorage 等本地存储技术来维持您的登录状态、记住您的偏好设置。
            </p>
            <p className="mt-2">
              6.2 我们不使用第三方跟踪 Cookie 进行广告投放或用户行为追踪。
            </p>
            <p className="mt-2">
              6.3 您可以通过浏览器设置管理或删除 Cookie。请注意，禁用 Cookie 可能影响您正常使用本平台的部分功能。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">七、您的权利</h2>
            <p>根据《中华人民共和国个人信息保护法》等相关法律法规，您享有以下权利：</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li><strong>知情权</strong>：了解我们如何收集、使用和处理您的个人信息</li>
              <li><strong>访问权</strong>：查看和获取您的个人信息副本</li>
              <li><strong>更正权</strong>：更正不准确或不完整的个人信息</li>
              <li><strong>删除权</strong>：在特定情况下要求删除您的个人信息</li>
              <li><strong>撤回同意权</strong>：撤回您此前给予的同意（不影响撤回前基于同意的处理活动的合法性）</li>
              <li><strong>注销权</strong>：注销您的账户，我们将按照本政策第 4.2 条处理您的信息</li>
              <li><strong>投诉权</strong>：如您认为我们的信息处理行为损害了您的合法权益，您有权向相关监管部门投诉</li>
            </ul>
            <p className="mt-2">
              您可以通过本平台的"设置 - 账户"页面行使上述权利，或通过以下联系方式与我们取得联系。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">八、未成年人保护</h2>
            <p>
              8.1 本平台主要面向成年用户。如果您是未满 18 周岁的未成年人，请在法定监护人的陪同和指导下阅读本隐私政策，并在取得法定监护人的同意后使用本平台服务。
            </p>
            <p className="mt-2">
              8.2 如果我们发现在未获得法定监护人同意的情况下收集了未成年人的个人信息，我们将尽快删除相关信息。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">九、隐私政策的变更</h2>
            <p>
              9.1 我们可能会不时更新本隐私政策。更新后的隐私政策将在本平台上公布，并注明更新日期。
            </p>
            <p className="mt-2">
              9.2 对于重大变更（如收集信息范围扩大、使用目的变更等），我们将通过平台内通知、弹窗提示等方式向您告知，并在必要时重新征得您的同意。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-gray-900">十、联系我们</h2>
            <p>
              如您对本隐私政策有任何疑问、意见或建议，或希望行使您的个人信息权利，请通过以下方式与我们联系：
            </p>
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p><strong>公司名称</strong>：峰极科技</p>
              <p className="mt-1"><strong>联系邮箱</strong>：privacy@fengji.tech</p>
              <p className="mt-1"><strong>客服支持</strong>：support@fengji.tech</p>
              <p className="mt-1"><strong>响应时限</strong>：我们将在收到您的请求后 15 个工作日内予以回复</p>
            </div>
          </section>
        </div>

        <div className="mt-12 rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-500">
          <p>如有疑问，请联系我们：privacy@fengji.tech</p>
          <p className="mt-1">峰极科技 版权所有 © {new Date().getFullYear()}</p>
        </div>
      </main>
    </div>
  );
}
