import type { ResultRecord } from "../../store/app-data";
import { TaskSection } from "./results-shared";

function TrendWatchTaskBody({ result }: { result: ResultRecord }) {
  const payload =
    result.taskPayload.kind === "trend_watch"
      ? result.taskPayload
      : {
          kind: "trend_watch" as const,
          watchSummary: result.summary,
          watchSignals: result.whyNowItems.map((item, index) => ({
            label: `信号 ${index + 1}`,
            detail: item.fact,
          })),
          revisitTriggers: result.continueIf,
          cooldownWarnings: result.stopIf,
          scheduleHint: "建议按观察节奏复查。",
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="现在先盯什么"
        description="这次不是直接执行任务，首屏交付的是观察重点、复查信号和重判条件。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.watchSummary}
          </p>
          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-gray-500">
            {payload.scheduleHint}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {payload.watchSignals.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
              <div className="text-[11px] text-gray-400">{item.label}</div>
              <p className="mt-2 break-words text-sm leading-relaxed text-gray-700">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </TaskSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaskSection title="什么变化再回来" description="这些反馈出现后，说明这波值得升级重判。">
          <div className="space-y-2">
            {payload.revisitTriggers.map((item, index) => (
              <p
                key={`revisit-${index}`}
                className="break-words rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
        <TaskSection title="调整优先级的信号" description="这些信号出现时，可以重新评估优先级和资源分配。">
          <div className="space-y-2">
            {payload.cooldownWarnings.map((item, index) => (
              <p
                key={`cooldown-${index}`}
                className="break-words rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
      </div>
    </div>
  );
}

function ViralBreakdownTaskBody({ result }: { result: ResultRecord }) {
  const payload =
    result.taskPayload.kind === "viral_breakdown"
      ? result.taskPayload
      : {
          kind: "viral_breakdown" as const,
          breakdownSummary: result.summary,
          copyPoints: result.bestFor,
          avoidPoints: result.notFor,
          migrationSteps: result.continueIf,
          proofContents: result.supportingContents.slice(0, 3).map((item) => ({
            contentId: item.contentId,
            title: item.title,
            structureSummary: item.structureSummary,
            whyIncluded: item.whyIncluded,
          })),
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="这条到底该抄哪几处"
        description="拆解页首屏交付的不是抽象判断，而是结构、迁移和避坑点。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.breakdownSummary}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <div className="mb-2 text-xs text-emerald-700">值得抄</div>
            <div className="space-y-1.5">
              {payload.copyPoints.map((item, index) => (
                <p key={`copy-${index}`} className="break-words text-sm text-emerald-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-4">
            <div className="mb-2 text-xs text-amber-700">迁移时要调整</div>
            <div className="space-y-1.5">
              {payload.avoidPoints.map((item, index) => (
                <p key={`avoid-${index}`} className="break-words text-sm text-amber-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <div className="mb-2 text-xs text-gray-500">迁移步骤</div>
            <div className="space-y-1.5">
              {payload.migrationSteps.map((item, index) => (
                <p key={`step-${index}`} className="break-words text-sm text-gray-800">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </TaskSection>

      <TaskSection title="结构证明样本" description="不是只给结论，而是把进入这次拆解链的真实样本摆出来。">
        <div className="grid gap-3 lg:grid-cols-3">
          {payload.proofContents.map((item) => (
            <div
              key={item.contentId}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
              <div className="line-clamp-2 break-words text-sm text-gray-900">{item.title}</div>
              <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-relaxed text-gray-600">
                {item.structureSummary}
              </div>
              <p className="mt-3 break-words text-xs leading-relaxed text-gray-500">
                {item.whyIncluded}
              </p>
            </div>
          ))}
        </div>
      </TaskSection>
    </div>
  );
}

function TopicStrategyTaskBody({ result }: { result: ResultRecord }) {
  const payload =
    result.taskPayload.kind === "topic_strategy"
      ? result.taskPayload
      : {
          kind: "topic_strategy" as const,
          strategySummary: result.summary,
          topicDirections: [],
          fitRationale: result.accountMatchSummary,
          firstMoves: result.continueIf,
          stopRules: result.stopIf,
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="接下来优先做哪几题"
        description="策略页首屏应该直接给可执行方向，而不是继续停在泛判断。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.strategySummary}
          </p>
          <p className="mt-3 break-words text-xs leading-relaxed text-gray-500">
            {payload.fitRationale}
          </p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {payload.topicDirections.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
              <div className="text-sm text-gray-900">{item.title}</div>
              <p className="mt-2 break-words text-xs leading-relaxed text-gray-600">
                {item.whyNow}
              </p>
              <p className="mt-2 break-words text-xs leading-relaxed text-gray-500">
                {item.fitNote}
              </p>
            </div>
          ))}
        </div>
      </TaskSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaskSection title="第一步先做什么">
          <div className="space-y-2">
            {payload.firstMoves.map((item, index) => (
              <p
                key={`move-${index}`}
                className="break-words rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
        <TaskSection title="何时调整策略" description="这些信号出现时，可以优化方向或切换角度。">
          <div className="space-y-2">
            {payload.stopRules.map((item, index) => (
              <p
                key={`stop-${index}`}
                className="break-words rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
      </div>
    </div>
  );
}

function CopyExtractionTaskBody({ result }: { result: ResultRecord }) {
  const payload =
    result.taskPayload.kind === "copy_extraction"
      ? result.taskPayload
      : {
          kind: "copy_extraction" as const,
          extractionSummary: result.summary,
          hookPatterns: [],
          structurePatterns: [],
          ctaPatterns: [],
          reusablePhrases: [],
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="这次能直接拿走什么表达资产"
        description="文案提取页的 aha moment 是看完就能带走钩子、结构和 CTA，不是再读一遍解释。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.extractionSummary}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            { title: "可复用钩子", items: payload.hookPatterns },
            { title: "结构模式", items: payload.structurePatterns },
            { title: "CTA 模式", items: payload.ctaPatterns },
            { title: "可直接改写的表达", items: payload.reusablePhrases },
          ].map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-gray-100 bg-white px-4 py-4"
            >
              <div className="mb-2 text-xs text-gray-400">{section.title}</div>
              <div className="space-y-1.5">
                {section.items.map((item, index) => (
                  <p
                    key={`${section.title}-${index}`}
                    className="break-words text-sm leading-relaxed text-gray-700"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TaskSection>
    </div>
  );
}

function AccountDiagnosisTaskBody({ result }: { result: ResultRecord }) {
  const payload =
    result.taskPayload.kind === "account_diagnosis"
      ? result.taskPayload
      : {
          kind: "account_diagnosis" as const,
          diagnosisSummary: result.accountMatchSummary,
          strengths: result.bestFor,
          gaps: result.notFor,
          benchmarkAccounts: [],
          adjustments: result.continueIf,
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="这个号现在能不能接"
        description="账号诊断页首屏应该先回答承接判断，再告诉你哪里该改。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.diagnosisSummary}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <div className="mb-2 text-xs text-emerald-700">当前能继续放大的部分</div>
            <div className="space-y-1.5">
              {payload.strengths.map((item, index) => (
                <p key={`strength-${index}`} className="break-words text-sm text-emerald-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-4">
            <div className="mb-2 text-xs text-amber-700">当前主要短板</div>
            <div className="space-y-1.5">
              {payload.gaps.map((item, index) => (
                <p key={`gap-${index}`} className="break-words text-sm text-amber-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </TaskSection>

      {payload.benchmarkAccounts.length > 0 && (
        <TaskSection title="对标账号" description="这些账号进入了本次诊断链，方便你判断应该朝哪种打法靠。">
          <div className="grid gap-3 lg:grid-cols-3">
            {payload.benchmarkAccounts.map((account) => (
              <div
                key={account.accountId}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="text-sm text-gray-900">{account.displayName}</div>
                <div className="mt-1 text-xs text-gray-400">@{account.handle}</div>
                <p className="mt-3 break-words text-xs leading-relaxed text-gray-600">
                  {account.whyIncluded}
                </p>
              </div>
            ))}
          </div>
        </TaskSection>
      )}

      <TaskSection title="接下来怎么调" description="别只看诊断结论，首屏直接给调整方向。">
        <div className="space-y-2">
          {payload.adjustments.map((item, index) => (
            <p
              key={`adjust-${index}`}
              className="break-words rounded-2xl bg-white px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-100"
            >
              {item}
            </p>
          ))}
        </div>
      </TaskSection>
    </div>
  );
}

export function TaskResultBody({ result }: { result: ResultRecord }) {
  switch (result.taskIntent) {
    case "trend_watch":
      return <TrendWatchTaskBody result={result} />;
    case "viral_breakdown":
      return <ViralBreakdownTaskBody result={result} />;
    case "topic_strategy":
      return <TopicStrategyTaskBody result={result} />;
    case "copy_extraction":
      return <CopyExtractionTaskBody result={result} />;
    case "account_diagnosis":
      return <AccountDiagnosisTaskBody result={result} />;
    default:
      return null;
  }
}
