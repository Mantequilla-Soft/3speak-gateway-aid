import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  VideoLibrary,
  PlayCircleOutline,
  Computer,
  TrendingUp
} from '@mui/icons-material';

interface EncoderInfo {
  nodeName: string;
  hiveAccount?: string;
  didKey: string;
}

interface RecentJob {
  id: string;
  fullId: string;
  status: string;
  videoOwner: string;
  videoPermlink: string;
  videoSize: number;
  videoSizeFormatted: string;
  createdAt: string;
  createdAgo: string;
  assignedTo?: string;
  encoderInfo?: EncoderInfo;
  progress?: number;
}

interface DashboardData {
  availableJobs: number;
  jobsInProgress: number;
  activeEncoders: number;
  jobsCompletedToday: number;
  recentJobs: RecentJob[];
}

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    availableJobs: 0,
    jobsInProgress: 0,
    activeEncoders: 0,
    jobsCompletedToday: 0,
    recentJobs: []
  });
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setError(null);

      // Fetch dashboard data from the new endpoint
      const response = await fetch('/api/statistics/dashboard');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch dashboard data');
      }

      const data = result.data;
      setDashboardData({
        availableJobs: data.availableJobs || 0,
        jobsInProgress: data.jobsInProgress || 0,
        activeEncoders: data.activeEncoders || 0,
        jobsCompletedToday: data.jobsCompletedToday || 0,
        recentJobs: data.recentJobs || []
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch dashboard data');
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Set up polling every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Gateway Monitor Dashboard
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

            <Grid container spacing={3}>
        {/* Metrics Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Available Jobs
                </Typography>
                <Typography variant="h4">
                  {dashboardData.availableJobs}
                </Typography>
              </div>
              <VideoLibrary color="primary" sx={{ fontSize: 40 }} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Jobs in Progress
                </Typography>
                <Typography variant="h4">
                  {dashboardData.jobsInProgress}
                </Typography>
              </div>
              <PlayCircleOutline color="error" sx={{ fontSize: 40 }} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Active Encoders
                </Typography>
                <Typography variant="h4">
                  {dashboardData.activeEncoders}
                </Typography>
              </div>
              <Computer color="success" sx={{ fontSize: 40 }} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Jobs Today
                </Typography>
                <Typography variant="h4">
                  {dashboardData.jobsCompletedToday}
                </Typography>
              </div>
              <TrendingUp color="info" sx={{ fontSize: 40 }} />
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Jobs Table - Full Width */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Jobs
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Job ID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Video</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Encoder</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dashboardData.recentJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {job.fullId}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={job.status} 
                            size="small"
                            color={
                              job.status === 'complete' ? 'success' :
                              job.status === 'running' ? 'primary' :
                              job.status === 'unassigned' ? 'warning' : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {job.videoOwner}/{job.videoPermlink}
                          </Typography>
                        </TableCell>
                        <TableCell>{job.videoSizeFormatted}</TableCell>
                        <TableCell>
                          {job.encoderInfo ? (
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                {job.encoderInfo.nodeName}
                              </Typography>
                              {job.encoderInfo.hiveAccount && (
                                <Typography variant="caption" color="text.secondary">
                                  @{job.encoderInfo.hiveAccount}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {job.assignedTo ? 'Unknown Encoder' : 'Unassigned'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{job.createdAgo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* System Status - Moved Below */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Gateway API</Typography>
                  <Chip label="Connected" size="small" color="success" />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">MongoDB</Typography>
                  <Chip label="Connected" size="small" color="success" />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">WebSocket</Typography>
                  <Chip label="Connected" size="small" color="success" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}