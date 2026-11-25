import { MdkProvider, useAuthToken } from "@tetherto/mdk-react-adapter";
import { BarController, Chart, LineController } from "chart.js";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";

import "@tetherto/mdk-react-devkit/styles.css";
import "@tetherto/mdk-react-devkit/styles-domain.css";
import { SignInPage } from "./SignInPage";
import { SitePage } from "./SitePage";
import { auth } from "./utils";

// The installed apps' charts mix bar and line datasets on one canvas. The
// devkit registers the line controller only as a side effect of its area chart,
// which a page may never load first: register both controllers up front.
Chart.register(BarController, LineController);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("ERR_ROOT_ELEMENT_MISSING");

function App() {
  return useAuthToken() ? <SitePage /> : <SignInPage />;
}

// Same-origin: the Vite dev proxy forwards /site/*, /apps/* and /auth/* to the
// gateway. One silent refresh first, so a reload stays signed in.
void auth.restore().finally(() => {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <HashRouter>
        <MdkProvider apiBaseUrl="" auth={auth} fetcher={auth.fetcher}>
          <App />
        </MdkProvider>
      </HashRouter>
    </StrictMode>,
  );
});
