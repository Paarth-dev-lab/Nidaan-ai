import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import AuthScreen from './pages/AuthScreen';
import Dashboard from './pages/Dashboard';
import Timeline from './pages/Timeline';
import Profile from './pages/Profile';
import './index.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{display:'flex', height:'100vh', justifyContent:'center', alignItems:'center', background:'var(--bg)', color:'var(--text-main)', fontSize:'1.5rem', fontFamily:'Inter'}}>Starting Nidaan Engine...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={!session ? <AuthScreen /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/" />} />
        <Route path="/timeline" element={session ? <Timeline session={session} /> : <Navigate to="/" />} />
        <Route path="/profile" element={session ? <Profile session={session} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
