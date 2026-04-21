import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl items-center justify-center px-6 py-12">
      <div className="rounded-[32px] border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="mb-3 text-xs uppercase tracking-[0.24em] text-gray-400">
          404
        </div>
        <h1 className="mb-3 text-3xl text-gray-900">这个页面不存在</h1>
        <p className="text-sm leading-7 text-gray-500">
          路由已经接通，但当前地址没有匹配到页面。
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
