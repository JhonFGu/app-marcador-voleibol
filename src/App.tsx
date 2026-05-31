import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MatchSetup from './pages/MatchSetup';
import MatchScoreboard from './pages/MatchScoreboard';
import TournamentsList from './pages/TournamentsList';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import TournamentEdit from './pages/TournamentEdit';
import TournamentPlay from './pages/TournamentPlay';
import RefScoreboard from './pages/RefScoreboard';
import PublicTournament from './pages/PublicTournament';
import PublicLiveMatch from './pages/PublicLiveMatch';
import { supabase } from './supabaseClient';
import { useAuthStore } from './store/authStore';

function App() {
  const checkUser = useAuthStore((state) => state.checkUser);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    // Check current session
    checkUser();

    // Listen for auth state shifts
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [checkUser, setSession]);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="min-h-screen bg-black text-white selection:bg-purple-brand/30 selection:text-white">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/match/setup" element={<MatchSetup />} />
          <Route path="/match/scoreboard" element={<MatchScoreboard />} />
          <Route path="/tournaments" element={<TournamentsList />} />
          <Route path="/tournament/:id" element={<PublicTournament />} />
          <Route path="/tournament/:id/live/:matchId" element={<PublicLiveMatch />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/tournament/:id/edit" element={<TournamentEdit />} />
          <Route path="/admin/tournament/:id/play" element={<TournamentPlay />} />
          <Route path="/admin/match/referee/:matchId" element={<RefScoreboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
