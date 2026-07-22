import { useEffect, useState, type PropsWithChildren } from 'react';

function detectPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

export function OrientationGuard({ children }: PropsWithChildren): React.JSX.Element {
  const [isPortrait, setIsPortrait] = useState(detectPortrait);

  useEffect(() => {
    const updateOrientation = (): void => setIsPortrait(detectPortrait());
    const mediaQuery = window.matchMedia('(orientation: portrait)');

    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    mediaQuery.addEventListener('change', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      mediaQuery.removeEventListener('change', updateOrientation);
    };
  }, []);

  return (
    <>
      {children}
      {isPortrait && (
        <div className="orientation-guard" role="dialog" aria-modal="true" aria-label="横画面の案内">
          <div className="orientation-card">
            <div className="phone-rotate" aria-hidden="true">
              <span />
            </div>
            <h2>スマホを横向きにしてください</h2>
            <p>『ぼくの自販機』は、町を広く見渡せる横画面専用です。</p>
          </div>
        </div>
      )}
    </>
  );
}
