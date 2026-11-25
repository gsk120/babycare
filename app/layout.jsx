import "./globals.css";

export const metadata = {
  title: "이유식케어 AI",
  description: "우리 집 이유식 추천, 식재료 재고와 조리 기록",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
