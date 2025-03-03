// This file helps with forcing a refresh after deployments by adding version info to the document
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Add version as a meta tag for cache busting */}
        <meta name="version" content={process.env.version} />
        {/* Force reload if version changes by updating local storage */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const currentVersion = "${process.env.version}";
                const storedVersion = localStorage.getItem('app_version');
                
                if (storedVersion && storedVersion !== currentVersion) {
                  // Version changed - clear caches
                  localStorage.setItem('app_version', currentVersion);
                  
                  // Only reload if not a fresh page load (prevents infinite reloads)
                  if (performance.navigation.type !== 1) {
                    window.location.reload(true);
                  }
                } else if (!storedVersion) {
                  // First time - set version
                  localStorage.setItem('app_version', currentVersion);
                }
              } catch (e) {
                console.error('Version check error:', e);
              }
            })();
          `
        }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}