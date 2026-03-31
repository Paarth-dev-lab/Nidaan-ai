import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FileDown, Activity, HeartPulse, Calendar, TrendingUp, TrendingDown,
  Sparkles, Clock, ChevronDown, AlertTriangle, CheckCircle, Loader2, Filter, ArrowUpDown, Trash2, User
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import ReactMarkdown from 'react-markdown';

const Timeline = ({ session }) => {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('ai_date'); // 'ai_date' or 'test_date'
  const [expandedReport, setExpandedReport] = useState(null);
  
  // Progress Analysis
  const [progressDays, setProgressDays] = useState(30);
  const [progressData, setProgressData] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);

  const dayOptions = [7, 15, 30, 60, 90, 180, 365];

  const extractChartData = (reps) => {
    const sorted = [...reps].sort((a, b) => {
      const dateA = getReportDate(a, 'ai_date');
      const dateB = getReportDate(b, 'ai_date');
      return new Date(dateA) - new Date(dateB);
    });
    return sorted.map(rep => {
      const pages = rep.raw_json?.pages || [];
      let pt = { date: new Date(getReportDate(rep, sortBy)).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) };
      pages.forEach(page => {
        (page.lab_results || []).forEach(lr => {
          if (lr.test_name && lr.result) {
            const key = lr.test_name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 14);
            const val = parseFloat(lr.result);
            if (!isNaN(val)) pt[key] = val;
          }
        });
      });
      return pt;
    });
  };

  const getReportDate = (report, mode) => {
    if (mode === 'test_date') {
      const testDate = report.raw_json?.report_metadata?.actual_test_date;
      if (testDate && testDate !== 'Not available' && testDate !== 'Unknown') {
        // Try to parse DD/MM/YYYY format
        const parts = testDate.split('/');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
      }
    }
    return report.created_at;
  };

  const getDisplayDate = (report) => {
    const meta = report.raw_json?.report_metadata || {};
    const testDate = meta.actual_test_date;
    const aiDate = new Date(report.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    return { testDate: testDate && testDate !== 'Not available' ? testDate : null, aiDate };
  };

  const getLabInfo = (report) => {
    const meta = report.raw_json?.report_metadata || {};
    return {
      lab: meta.lab_name && meta.lab_name !== 'Not mentioned in report' ? meta.lab_name : null,
      doctor: meta.referring_doctor && meta.referring_doctor !== 'Not mentioned in report' ? meta.referring_doctor : null
    };
  };

  const loadData = async () => {
    try {
      const r = await fetch('http://localhost:8000/api/reports', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) setReports(d.reports);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDownload = async (reportId) => {
    try {
      const r = await fetch(`http://localhost:8000/api/export/pdf/${reportId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Nidaan_Report_${reportId}.pdf`;
      a.click();
    } catch (e) { alert('Error generating PDF'); }
  };

  const deleteReport = async (e, reportId) => {
    e.stopPropagation();
    if (!confirm('Delete this report permanently? This cannot be undone.')) return;
    try {
      const r = await fetch(`http://localhost:8000/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) {
        setReports(prev => prev.filter(rep => rep.id !== reportId));
        if (expandedReport === reportId) setExpandedReport(null);
      }
    } catch (e) { console.error(e); alert('Failed to delete'); }
  };

  const generateProgressAnalysis = async (days) => {
    setProgressDays(days);
    setShowDaysDropdown(false);
    setProgressLoading(true);
    setProgressData(null);
    try {
      const fd = new FormData();
      fd.append('days', days);
      fd.append('language', 'en-IN');
      const r = await fetch('http://localhost:8000/api/reports/progress-analysis', {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const d = await r.json();
      if (d.success) setProgressData(d);
      else alert(d.detail || 'Analysis failed');
    } catch (e) { console.error(e); alert('Server error'); }
    finally { setProgressLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const sortedReports = [...reports].sort((a, b) => {
    const dA = new Date(getReportDate(a, sortBy));
    const dB = new Date(getReportDate(b, sortBy));
    return dB - dA;
  });

  const chartData = extractChartData(reports);
  const activeKeys = chartData.length > 0 ? Object.keys(chartData[0]).filter(k => k !== 'date') : [];
  const chartColors = ['#10a37f', '#8b5cf6', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6'];

  return (
    <div className="timeline-page">
      {/* Top Bar */}
      <div className="timeline-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HeartPulse size={20} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>NIDAAN.ai</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>/ Health Timeline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="topbar-btn" onClick={() => navigate('/profile')}>
            <User size={14} /> Profile
          </button>
          <button className="topbar-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} /> Dashboard
          </button>
        </div>
      </div>

      <div className="timeline-body">
        {/* Header Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="timeline-title">Health Timeline</div>
            <div className="timeline-subtitle">Longitudinal EHR data & biomarker trajectory</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="tl-sort-btn" onClick={() => setSortBy(sortBy === 'ai_date' ? 'test_date' : 'ai_date')}>
              <ArrowUpDown size={14} />
              {sortBy === 'ai_date' ? 'AI Analysis Date' : 'Original Test Date'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', padding: '60px 0', textAlign: 'center' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 12px' }} />
            Loading your medical records...
          </div>
        ) : reports.length === 0 ? (
          <div className="tl-empty-card">
            <HeartPulse size={36} color="var(--text-tertiary)" />
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No reports yet</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Upload a medical report from your dashboard to start tracking health over time.</div>
          </div>
        ) : (
          <>
            {/* ═══ PROGRESS ANALYSIS SECTION ═══ */}
            <div className="tl-progress-section">
              <div className="tl-progress-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={18} color="var(--accent)" />
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>AI Progress Analysis</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <button className="tl-days-btn" onClick={() => setShowDaysDropdown(!showDaysDropdown)}>
                    <Clock size={14} /> Past {progressDays} days <ChevronDown size={14} />
                  </button>
                  {showDaysDropdown && (
                    <div className="tl-days-dropdown">
                      {dayOptions.map(d => (
                        <button key={d} className={`tl-days-option ${progressDays === d ? 'active' : ''}`} onClick={() => generateProgressAnalysis(d)}>
                          {d} days
                        </button>
                      ))}
                      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                        <input
                          type="number" placeholder="Custom days" min="1" max="730"
                          className="tl-days-input"
                          onKeyDown={e => { if (e.key === 'Enter') generateProgressAnalysis(parseInt(e.target.value) || 30); }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!progressData && !progressLoading && (
                <div className="tl-progress-empty">
                  <TrendingUp size={24} color="var(--text-tertiary)" />
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Select a time period to generate an AI-powered analysis of your health progress
                  </div>
                  <button className="tl-generate-btn" onClick={() => generateProgressAnalysis(progressDays)}>
                    <Sparkles size={16} /> Generate Analysis
                  </button>
                </div>
              )}

              {progressLoading && (
                <div className="tl-progress-empty">
                  <div className="dna-helix" style={{ transform: 'scale(0.6)' }}>
                    {[...Array(7)].map((_, i) => <div key={i} className="helix-bar" />)}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Analyzing your health trajectory...</div>
                </div>
              )}

              {progressData && (
                <div className="tl-progress-results">
                  {/* Score Cards */}
                  <div className="tl-score-row">
                    <div className="tl-score-card">
                      <div className="tl-score-label">Reports Analyzed</div>
                      <div className="tl-score-value">{progressData.reports_analyzed}</div>
                    </div>
                    <div className="tl-score-card">
                      <div className="tl-score-label">Initial Severity</div>
                      <div className="tl-score-value" style={{ color: progressData.earliest_severity > 50 ? 'var(--danger)' : 'var(--accent)' }}>
                        {progressData.earliest_severity}<span className="tl-score-unit">/100</span>
                      </div>
                    </div>
                    <div className="tl-score-card">
                      <div className="tl-score-label">Current Severity</div>
                      <div className="tl-score-value" style={{ color: progressData.latest_severity > 50 ? 'var(--danger)' : 'var(--accent)' }}>
                        {progressData.latest_severity}<span className="tl-score-unit">/100</span>
                      </div>
                    </div>
                    <div className="tl-score-card">
                      <div className="tl-score-label">Improvement</div>
                      <div className="tl-score-value" style={{ color: progressData.improvement_percentage >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {progressData.improvement_percentage >= 0 ? '+' : ''}{progressData.improvement_percentage}%
                      </div>
                    </div>
                  </div>

                  {/* Improvements & Concerns */}
                  <div className="tl-twin-cols">
                    <div className="tl-col-card improvements">
                      <div className="tl-col-title"><CheckCircle size={16} /> Improvements</div>
                      {(progressData.key_improvements || []).length > 0 ? (
                        progressData.key_improvements.map((item, i) => (
                          <div key={i} className="tl-col-item improvement">{item}</div>
                        ))
                      ) : (
                        <div className="tl-col-item" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None notable</div>
                      )}
                    </div>
                    <div className="tl-col-card concerns">
                      <div className="tl-col-title"><AlertTriangle size={16} /> Concerns</div>
                      {(progressData.key_concerns || []).length > 0 ? (
                        progressData.key_concerns.map((item, i) => (
                          <div key={i} className="tl-col-item concern">{item}</div>
                        ))
                      ) : (
                        <div className="tl-col-item" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None notable</div>
                      )}
                    </div>
                  </div>

                  {/* Full Analysis */}
                  <div className="tl-analysis-block">
                    <div className="tl-analysis-title"><Activity size={16} /> Detailed Analysis</div>
                    <div className="tl-analysis-body">
                      <ReactMarkdown
                        components={{
                          h3: ({node, ...props}) => {
                            const text = String(props.children).toLowerCase();
                            let color = 'var(--text-primary)';
                            let icon = '✦';
                            if (text.includes('improv')) { color = 'var(--accent)'; icon = '🌱'; }
                            else if (text.includes('worsen') || text.includes('concern')) { color = '#ef4444'; icon = '⚠️'; }
                            else if (text.includes('precaut') || text.includes('risk')) { color = '#f59e0b'; icon = '🛡️'; }
                            else if (text.includes('recommend') || text.includes('action')) { color = '#3b82f6'; icon = '💡'; }
                            return (
                              <h3 style={{ 
                                color, marginTop: '20px', marginBottom: '10px', paddingBottom: '6px', 
                                borderBottom: `1px solid ${color}30`, display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '1rem'
                              }}>
                                <span>{icon}</span>{props.children}
                              </h3>
                            );
                          },
                          ul: ({node, ...props}) => <ul style={{ paddingLeft: '24px', margin: '8px 0 16px', listStyleType: 'disc' }} {...props} />,
                          li: ({node, ...props}) => <li style={{ marginBottom: '6px', lineHeight: '1.6' }} {...props} />,
                          strong: ({node, ...props}) => <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }} {...props} />
                        }}
                      >
                        {progressData.progress_summary || ''}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Download Progress PDF */}
                  <button className="tl-progress-pdf-btn" onClick={async () => {
                    try {
                      const fd = new FormData();
                      fd.append('progress_data', JSON.stringify(progressData));
                      const r = await fetch('http://localhost:8000/api/export/progress-pdf', {
                        method: 'POST', body: fd,
                        headers: { Authorization: `Bearer ${session.access_token}` }
                      });
                      if (!r.ok) {
                        const errData = await r.json().catch(() => ({}));
                        alert(`PDF Error: ${errData.detail || r.statusText}`);
                        return;
                      }
                      const blob = await r.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'Health_Progress_Report.pdf';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                    } catch (e) { alert(`Failed to generate PDF: ${e.message}`); }
                  }}>
                    <FileDown size={15} /> Download Progress Report (PDF)
                  </button>
                </div>
              )}
            </div>

            {/* ═══ BIOMARKER CHART ═══ */}
            {activeKeys.length > 0 && (
              <div className="timeline-chart-card">
                <div className="timeline-chart-title">
                  <Activity size={18} color="var(--accent)" /> Biomarker Trajectory
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    Sorted by {sortBy === 'ai_date' ? 'Analysis Date' : 'Test Date'}
                  </span>
                </div>
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        {activeKeys.slice(0, 7).map((key, i) => (
                          <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartColors[i % chartColors.length]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={chartColors[i % chartColors.length]} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} />
                      <YAxis stroke="var(--text-tertiary)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '10px',
                          color: 'var(--text-primary)',
                          fontSize: '0.82rem',
                          boxShadow: 'var(--shadow-md)'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                      {activeKeys.slice(0, 7).map((key, i) => (
                        <Area
                          key={key} type="monotone" dataKey={key}
                          stroke={chartColors[i % chartColors.length]}
                          fill={`url(#grad-${i})`}
                          strokeWidth={2}
                          dot={{ r: 3, fill: chartColors[i % chartColors.length] }}
                          activeDot={{ r: 6, strokeWidth: 2 }}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ═══ REPORT CARDS ═══ */}
            <div className="tl-reports-header">
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                All Reports ({reports.length})
              </span>
            </div>

            <div className="tl-reports-list">
              {sortedReports.map(report => {
                const dates = getDisplayDate(report);
                const labInfo = getLabInfo(report);
                const isExpanded = expandedReport === report.id;
                
                return (
                  <div key={report.id} className={`tl-report-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="tl-report-head" onClick={() => setExpandedReport(isExpanded ? null : report.id)}>
                      <div className="tl-report-left">
                        <div className="tl-report-dates">
                          {dates.testDate && (
                            <span className="tl-date-badge test">
                              <Calendar size={12} /> Test: {dates.testDate}
                            </span>
                          )}
                          <span className="tl-date-badge ai">
                            <Sparkles size={12} /> AI: {dates.aiDate}
                          </span>
                        </div>
                        {labInfo.lab && (
                          <div className="tl-report-lab">{labInfo.lab}{labInfo.doctor ? ` • ${labInfo.doctor}` : ''}</div>
                        )}
                      </div>
                      <div className="tl-report-actions">
                        <button className="timeline-download-btn" onClick={(e) => { e.stopPropagation(); handleDownload(report.id); }}>
                          <FileDown size={14} /> PDF
                        </button>
                        <button className="timeline-delete-btn" onClick={(e) => deleteReport(e, report.id)}>
                          <Trash2 size={14} />
                        </button>
                        <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="tl-report-expanded">
                        <div className="tl-report-summary hide-scrollbar">
                          <ReactMarkdown>{report.markdown_summary || 'No summary available.'}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Timeline;
