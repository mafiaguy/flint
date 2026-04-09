// ── FLINT Global State (Zustand) ──

import { create } from 'zustand';
import { sb, db } from './api';

let _dataLoaded = false;

const useStore = create((set, get) => ({
  // Auth
  user: undefined,
  profile: null,

  // Data
  jobs: [],
  matches: [],
  applications: [],
  qa: [],

  // UI
  loading: false,

  // ── Auth actions ──
  initAuth: () => {
    sb.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user || null;
      set({ user });
      if (user && !_dataLoaded) {
        _dataLoaded = true;
        get().loadData();
      }
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      const prevUser = get().user;
      set({ user });
      // Only load data on actual sign-in, not duplicate events
      if (user && !prevUser) {
        _dataLoaded = true;
        get().loadData();
      }
      if (!user && prevUser) {
        _dataLoaded = false;
      }
    });

    return () => subscription.unsubscribe();
  },

  signOut: async () => {
    _dataLoaded = false;
    await sb.auth.signOut();
    set({ user: null, profile: null, jobs: [], matches: [], applications: [], qa: [] });
  },

  // ── Data loading ──
  loadData: async () => {
    const [profile, qa, apps, jobs, matches] = await Promise.all([
      db.getProfile(),
      db.getQA(),
      db.getApps(),
      db.getJobs(),
      db.getMatches(),
    ]);
    set({ profile: profile || null, qa, applications: apps, jobs, matches });
  },

  loadMatches: async () => {
    set({ loading: true });
    const matches = await db.getMatches();
    set({ matches, loading: false });
  },

  refreshMatches: async () => {
    set({ loading: true });
    await db.matchJobs();
    const matches = await db.getMatches();
    set({ matches, loading: false });
  },

  // ── Profile ──
  setProfile: (profile) => set({ profile }),

  saveProfile: async (updates) => {
    await db.saveProfile(updates);
    set((s) => ({ profile: { ...s.profile, ...updates } }));
  },

  // ── Jobs ──
  setJobs: (jobs) => set({ jobs }),

  // ── Applications ──
  addApplication: async (job, cover = "", mode = "manual") => {
    const user = get().user;
    if (!user) return;

    const app = {
      job_id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      source: job.source,
      url: job.url,
      cover_letter: cover,
      status: mode === "auto" ? "queued" : "applied",
      applied_at: new Date().toISOString(),
      user_id: user.id,
    };

    // Get the returned row with its generated id
    const { data } = await sb.from("applications").insert(app).select().single();

    if (mode === "auto") await db.queueApply(job, cover);

    set((s) => ({ applications: [data || app, ...s.applications] }));
  },

  updateAppStatus: async (id, status, extra = {}) => {
    await db.updateAppStatus(id, status, extra);
    set((s) => ({
      applications: s.applications.map((a) =>
        a.id === id ? { ...a, status, stage_updated_at: new Date().toISOString(), ...extra } : a
      ),
    }));

    // Auto-generate interview prep when moving to interview stage
    if (status === 'interview' || status === 'second_interview') {
      const app = get().applications.find((a) => a.id === id);
      if (app && !app.prep_content) {
        const profile = get().profile;
        db.callAI({
          type: 'interview-prep',
          job: { title: app.title, company: app.company, location: app.location, desc: '' },
          profile,
        }).then((res) => {
          if (res?.text) {
            db.updateAppNotes(id, `${app.notes || ''}\n\n--- INTERVIEW PREP ---\n${res.text}`.trim());
            set((s) => ({
              applications: s.applications.map((a) =>
                a.id === id ? { ...a, prep_content: res.text } : a
              ),
            }));
          }
        });
      }
    }
  },

  updateAppNotes: async (id, notes) => {
    await db.updateAppNotes(id, notes);
    set((s) => ({
      applications: s.applications.map((a) => (a.id === id ? { ...a, notes } : a)),
    }));
  },

  deleteApp: async (id) => {
    await db.deleteApp(id);
    set((s) => ({ applications: s.applications.filter((a) => a.id !== id) }));
  },

  // ── Q&A ──
  addQA: async (q, a) => {
    await db.addQA(q, a);
    const qa = await db.getQA();
    set({ qa });
  },

  deleteQA: async (id) => {
    await db.deleteQA(id);
    set((s) => ({ qa: s.qa.filter((x) => x.id !== id) }));
  },
}));

export default useStore;
