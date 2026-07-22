export function BuildBadge(): React.JSX.Element {
  const buildDate = new Date(__BUILD_TIME__);
  const formattedBuildTime = Number.isNaN(buildDate.getTime())
    ? __BUILD_TIME__
    : buildDate.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <div className="build-badge" title={`Build: ${formattedBuildTime}`}>
      v{__APP_VERSION__} · {__BUILD_COMMIT__}
    </div>
  );
}
