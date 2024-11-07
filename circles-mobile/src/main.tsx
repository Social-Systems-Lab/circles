import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { AccountSelect } from "./components/account/account-select";
import IdentityManager from "./components/account/identity-manager";
import CreateIdentity from "./components/account/create-identity";

const router = createBrowserRouter([
    {
        path: "/",
        element: <IdentityManager />,
        // element: <AccountSelect />,
    },
    {
        path: "/create-identity",
        element: <CreateIdentity />,
        // element: <AccountSelect />,
    },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
);
