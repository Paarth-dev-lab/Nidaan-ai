import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, LogOut, ArrowLeft, HeartPulse, FileText, MessageSquare, Calendar, ChevronRight } from 'lucide-react';

const Profile = ({ session }) => {
  const navigate = useNavigate();
  const [reportCount, setReportCount] = useState(0);
  const [threadCount, setThreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const user = session?.user;

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [reportsRes, threadsRes] = await Promise.all([
          fetch('http://localhost:8000/api/reports', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }),
          fetch('http://localhost:8000/api/chat/threads', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          })
        ]);

        if (reportsRes.ok) {
          const reportsData = await reportsRes.json();
          if (reportsData.success) setReportCount(reportsData.reports?.length || 0);
        }

        if (threadsRes.ok) {
          const threadsData = await threadsRes.json();
          if (threadsData.success) setThreadCount(threadsData.threads?.length || 0);
        }
      } catch (error) {
        console.error('Failed to fetch profile stats', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfileData();
  }, [session]);

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await supabase.auth.signOut();
    }
  };

  const joinDate = user?.created_at 
    ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unknown';

  return (
    <div className="timeline-page">
      {/* Top Bar (reusing timeline styles for consistency) */}
      <div className="timeline-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HeartPulse size={20} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>NIDAAN.ai</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>/ My Profile</span>
        </div>
        <button className="topbar-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={14} /> Dashboard
        </button>
      </div>

      <div className="timeline-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <div className="timeline-title">Account & Profile</div>
            <div className="timeline-subtitle">Manage your personal data and application settings</div>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', padding: '60px 0', textAlign: 'center' }}>
            <div className="dna-helix" style={{ transform: 'scale(0.6)', margin: '0 auto 12px' }}>
              {[...Array(7)].map((_, i) => <div key={i} className="helix-bar" />)}
            </div>
            Loading profile...
          </div>
        ) : (
          <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            
            {/* User Info Card */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-full)', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0 }}>Patient Profile</h2>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>{user?.email}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                  <Calendar size={18} />
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Member Since</div>
                    <div style={{ color: 'var(--text-primary)' }}>{joinDate}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                  <User size={18} />
                  <div>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Account ID</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{user?.id.substring(0, 18)}...</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Statistics Card */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px' }}>Your Health Vault</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', textAlign: 'center' }}>
                  <FileText size={24} color="var(--accent)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{reportCount}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reports Uploaded</div>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', textAlign: 'center' }}>
                  <MessageSquare size={24} color="var(--purple)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{threadCount}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Conversations</div>
                </div>
              </div>
              
              <div style={{ marginTop: '24px' }}>
                <button className="upload-btn" style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)' }} onClick={() => navigate('/timeline')}>
                  <ChevronRight size={16} /> View Timeline
                </button>
              </div>
            </div>
            
            {/* Actions Card */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '24px', gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px' }}>Account Actions</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Log Out</h4>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Securely sign out of your account on this device.</p>
                  </div>
                  <button className="upload-btn" style={{ width: 'auto', background: 'var(--danger)' }} onClick={handleLogout}>
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Data Export</h4>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>To request a full export of your health data, please go to your Timeline.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
