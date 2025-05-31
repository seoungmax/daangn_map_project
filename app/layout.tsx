import './globals.css'

export const metadata = {
  title: '강남/서초 맛집 지도',
  description: '강남구와 서초구의 맛집을 한눈에 볼 수 있는 지도 서비스입니다.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/icon.svg',
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
