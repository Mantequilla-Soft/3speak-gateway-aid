import { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  Button,
  CircularProgress,
  Alert,
  Grid,
  Divider
} from '@mui/material';
import { 
  CheckCircle as OnlineIcon,
  Error as OfflineIcon,
  Refresh as RefreshIcon,
  Speed as SpeedIcon,
  Security as AuthIcon,
  Assignment as JobIcon
} from '@mui/icons-material';

interface GatewayHealthStatus {
  isOnline: boolean;
  responseTime: number;
  lastCheck: string;
  error?: string;
  stats?: any;
  statusCode?: number;
  gatewayUrl?: string;
}

interface ComprehensiveResult {
  health: GatewayHealthStatus;
  registration: boolean;
  jobPolling: boolean;
  gatewayUrl: string;
  timestamp: string;
}

export function GatewayHealth() {
  const [healthStatus, setHealthStatus] = useState<GatewayHealthStatus | null>(null);
  const [comprehensiveResult, setComprehensiveResult] = useState<ComprehensiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch basic health status
  const fetchHealthStatus = async () => {
    try {
      setError(null);
      const response = await fetch('/api/statistics/gateway-health');
      const result = await response.json();
      
      if (result.success) {
        setHealthStatus(result.data);
        setLastUpdate(new Date());
      } else {
        setError(result.error || 'Failed to fetch gateway health');
      }
    } catch (err) {
      setError('Network error fetching gateway health');
      console.error('Gateway health fetch error:', err);
    }
  };

  // Perform comprehensive test
  const performComprehensiveTest = async () => {
    setLoading(true);
    try {
      setError(null);
      const response = await fetch('/api/statistics/gateway-comprehensive');
      const result = await response.json();
      
      if (result.success) {
        setComprehensiveResult(result.data);
        setHealthStatus(result.data.health);
        setLastUpdate(new Date());
      } else {
        setError(result.error || 'Failed to perform comprehensive test');
      }
    } catch (err) {
      setError('Network error performing comprehensive test');
      console.error('Comprehensive test error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh health status
  useEffect(() => {
    fetchHealthStatus();
    const interval = setInterval(fetchHealthStatus, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (isOnline: boolean) => isOnline ? 'success' : 'error';
  const getStatusIcon = (isOnline: boolean) => isOnline ? <OnlineIcon /> : <OfflineIcon />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h2" sx={{ flexGrow: 1 }}>
          Gateway Health Monitor
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchHealthStatus}
          sx={{ mr: 2 }}
        >
          Refresh
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={loading ? <CircularProgress size={20} /> : <AuthIcon />}
          onClick={performComprehensiveTest}
          disabled={loading}
        >
          {loading ? 'Testing...' : 'Full Test'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Basic Health Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Gateway Status
              </Typography>
              
              {healthStatus ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    {getStatusIcon(healthStatus.isOnline)}
                    <Chip
                      label={healthStatus.isOnline ? 'Online' : 'Offline'}
                      color={getStatusColor(healthStatus.isOnline)}
                      sx={{ ml: 1 }}
                    />
                  </Box>

                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Gateway URL: {healthStatus.gatewayUrl || 'Unknown'}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <SpeedIcon sx={{ mr: 1, fontSize: 'small' }} />
                    <Typography variant="body2">
                      Response Time: {healthStatus.responseTime}ms
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="textSecondary">
                    Last Check: {new Date(healthStatus.lastCheck).toLocaleString()}
                  </Typography>

                  {healthStatus.error && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      {healthStatus.error}
                    </Alert>
                  )}

                  {healthStatus.stats && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Gateway Stats:
                      </Typography>
                      <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                        {JSON.stringify(healthStatus.stats, null, 2)}
                      </pre>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Comprehensive Test Results */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Gateway Features Test
              </Typography>

              {comprehensiveResult ? (
                <Box>
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <AuthIcon sx={{ mr: 1, fontSize: 'small' }} />
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        DID Authentication:
                      </Typography>
                      <Chip
                        label={comprehensiveResult.registration ? 'Success' : 'Failed'}
                        color={comprehensiveResult.registration ? 'success' : 'error'}
                        size="small"
                      />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <JobIcon sx={{ mr: 1, fontSize: 'small' }} />
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        Job Polling:
                      </Typography>
                      <Chip
                        label={comprehensiveResult.jobPolling ? 'Available' : 'Unavailable'}
                        color={comprehensiveResult.jobPolling ? 'success' : 'warning'}
                        size="small"
                      />
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="body2" color="textSecondary">
                    Last Test: {new Date(comprehensiveResult.timestamp).toLocaleString()}
                  </Typography>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Test Summary:
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      • Health Check: {comprehensiveResult.health.isOnline ? '✅' : '❌'}<br />
                      • DID Registration: {comprehensiveResult.registration ? '✅' : '❌'}<br />
                      • Job API Access: {comprehensiveResult.jobPolling ? '✅' : '⚠️'}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', p: 3 }}>
                  <Typography variant="body2" color="textSecondary">
                    No comprehensive test performed yet.
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                    Click "Full Test" to check DID authentication and gateway features.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Real-time Status */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Monitoring Information
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Auto Refresh
                  </Typography>
                  <Typography variant="body2">
                    Every 30 seconds
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Last Update
                  </Typography>
                  <Typography variant="body2">
                    {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">
                    WebSocket
                  </Typography>
                  <Typography variant="body2">
                    Real-time updates
                  </Typography>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Monitor Type
                  </Typography>
                  <Typography variant="body2">
                    DID-based Health Check
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}