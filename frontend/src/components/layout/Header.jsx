import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../../theme';
import useStore from '../../store';

export default function Header() {
  const { profile, signOut } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={{
      padding: "10px 20px", display: "flex", alignItems: "center", gap: 10,
      borderBottom: `1px solid ${C.br}`, background: C.bg,
    }}>
      <span
        style={{ fontSize: 16, fontWeight: 800, color: C.t1, cursor: "pointer", letterSpacing: "-0.5px" }}
        onClick={() => navigate("/matches")}
      >
        flint
      </span>
      <div style={{ flex: 1 }} />

      <div style={{ position: "relative" }}>
        <div onClick={() => setShowMenu((p) => !p)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} style={{ width: 28, height: 28, borderRadius: 99 }} alt="" />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: 99, background: C.c2, color: C.t2,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
            }}>
              {(profile?.name || "U")[0]}
            </div>
          )}
          <svg width="12" height="12" fill="none" stroke={C.t3} strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {showMenu && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowMenu(false)} />
            <div style={{
              position: "absolute", right: 0, top: 40, background: C.c1,
              border: `1px solid ${C.br}`, borderRadius: 10, padding: 6,
              minWidth: 200, zIndex: 100, animation: "up .15s ease",
              boxShadow: "0 8px 30px rgba(0,0,0,.4)",
            }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.br}`, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{profile?.name}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{profile?.email}</div>
              </div>
              <button onClick={() => { navigate("/profile"); setShowMenu(false); }}
                style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.t1, fontSize: 13, textAlign: "left", cursor: "pointer", borderRadius: 6 }}>
                Profile
              </button>
              <button onClick={() => { navigate("/onboarding"); setShowMenu(false); }}
                style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.t1, fontSize: 13, textAlign: "left", cursor: "pointer", borderRadius: 6 }}>
                Edit preferences
              </button>
              <div style={{ borderTop: `1px solid ${C.br}`, margin: "4px 0" }} />
              <button onClick={async () => { setShowMenu(false); await signOut(); navigate("/"); }}
                style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.red, fontSize: 13, textAlign: "left", cursor: "pointer", borderRadius: 6 }}>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
