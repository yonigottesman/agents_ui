"use client";
import { useEffect } from "react";
import { API_CONFIG, buildApiUrl } from "../config/api";

function decodeJWT(token: string) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonPayload);
}

export default function LoginPage() {
  useEffect(() => {
    // Load Google Identity Services script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);

    // Wait for script to load, then initialize
    script.onload = () => {
      // @ts-ignore
      window.google.accounts.id.initialize({
        client_id: API_CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
      });
      // @ts-ignore
      window.google.accounts.id.renderButton(
        document.getElementById("g_id_signin"),
        { theme: "outline", size: "large" }
      );
    };
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function handleCredentialResponse(response: any) {
    const credential = response.credential;
    // Optionally decode and log user info
    // const responsePayload = decodeJWT(credential);
    // console.log(responsePayload);
    // Send credential to backend
    const res = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.GOOGLE_AUTH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
      credentials: "include",
    });
    if (res.ok) {
      // Optionally handle token, redirect, etc.
      window.location.href = "/";
    } else {
      alert("Google authentication failed");
    }
  }

  // Expose handler globally for Google callback
  // @ts-ignore
  if (typeof window !== "undefined") window.handleCredentialResponse = handleCredentialResponse;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh" }}>

      <div id="g_id_signin"></div>
    </div>
  );
} 