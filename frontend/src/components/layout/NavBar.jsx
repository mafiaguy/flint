import { useLocation, useNavigate } from 'react-router-dom';
import { C, MONO } from '../../theme';

const NAV = [
  { path: "/matches", label: "Matches" },
  { path: "/browse",  label: "Browse" },
  { path: "/tracker", label: "Tracker" },
  { path: "/profile", label: "Profile" },
];

export default function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname.startsWith('/job/') ? '/matches' : location.pathname;

  return (
    <nav style={{
      display: "flex", borderBottom: `1px solid ${C.br}`, background: C.c1,
      position: "sticky", top: 0, zIndex: 50, padding: "0 16px",
    }}>
      {NAV.map((n) => {
        const active = activePath === n.path;
        return (
          <button
            key={n.path}
            onClick={() => navigate(n.path)}
            style={{
              padding: "12px 20px", border: "none",
              background: "transparent",
              borderBottom: active ? `2px solid ${C.acc}` : "2px solid transparent",
              color: active ? C.t1 : C.t3,
              cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
              fontFamily: "inherit",
              transition: "color .15s",
            }}
          >
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
