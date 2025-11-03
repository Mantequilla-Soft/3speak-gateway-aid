import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GatewayHealth } from '../components/GatewayHealth';

interface DailyStatistics {
  date: string;
  videos_encoded: number;
  by_encoder: Record<string, number>;
  by_quality: Record<string, number>;
  average_encoding_time: number;
  success_rate: number;
  total_encoding_time: number;
}

interface EncoderStats {
  encoder_id: string;
  encoder_name?: string;
  jobs_completed: number;
  average_encoding_time: number;
  total_encoding_time: number;
  success_rate: number;
}

const QUALITY_COLORS: Record<string, string> = {
  '240p': '#8884d8',
  '480p': '#82ca9d',
  '720p': '#ffc658',
  '1080p': '#ff8042',
  'source': '#0088fe',
};

export function Analytics() {
  const [dailyStats, setDailyStats] = useState<DailyStatistics[]>([]);
  const [encoderStats, setEncoderStats] = useState<EncoderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<number>(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dailyResponse, encoderResponse] = await Promise.all([
        fetch(`/api/statistics/daily?days=${timeRange}`),
        fetch(`/api/statistics/encoders?days=${timeRange}`),
      ]);

      const dailyData = await dailyResponse.json();
      const encoderData = await encoderResponse.json();

      if (dailyData.success) {
        setDailyStats(dailyData.data);
      }

      if (encoderData.success) {
        setEncoderStats(encoderData.data);
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load analytics data');
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  };

  // Calculate KPIs
  const totalVideos = dailyStats.reduce((sum, day) => sum + day.videos_encoded, 0);
  const avgEncodingTime = dailyStats.length > 0
    ? Math.round(dailyStats.reduce((sum, day) => sum + day.average_encoding_time, 0) / dailyStats.length)
    : 0;
  const totalEncodingHours = Math.round(
    dailyStats.reduce((sum, day) => sum + day.total_encoding_time, 0) / 3600
  );
  const avgSuccessRate = dailyStats.length > 0
    ? (dailyStats.reduce((sum, day) => sum + day.success_rate, 0) / dailyStats.length * 100).toFixed(1)
    : '0.0';

  // Prepare quality distribution data
  const qualityDistribution: Record<string, number> = {};
  dailyStats.forEach(day => {
    Object.entries(day.by_quality).forEach(([quality, count]) => {
      qualityDistribution[quality] = (qualityDistribution[quality] || 0) + count;
    });
  });

  const qualityChartData = Object.entries(qualityDistribution).map(([quality, count]) => ({
    name: quality,
    value: count,
  }));

  // Format daily stats for line chart
  const dailyChartData = [...dailyStats].reverse().map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    videos: day.videos_encoded,
    avgTime: Math.round(day.average_encoding_time / 60), // Convert to minutes
  }));

  // Format encoder stats for bar chart
  const encoderChartData = encoderStats
    .sort((a, b) => b.jobs_completed - a.jobs_completed)
    .slice(0, 10)
    .map(encoder => ({
      name: encoder.encoder_name || encoder.encoder_id.substring(0, 12),
      jobs: encoder.jobs_completed,
      avgTime: Math.round(encoder.average_encoding_time / 60), // Convert to minutes
    }));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Analytics & Insights
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {formatRelativeTime(lastUpdated)}
            </Typography>
          )}
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(_, value) => value && setTimeRange(value)}
            size="small"
          >
            <ToggleButton value={7}>7d</ToggleButton>
            <ToggleButton value={30}>30d</ToggleButton>
            <ToggleButton value={90}>90d</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchAnalytics}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Gateway Health Monitor */}
      <GatewayHealth />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mt: 2, mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" variant="caption">
                    Total Videos Encoded
                  </Typography>
                  <Typography variant="h4">
                    {totalVideos.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Last {timeRange} days
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" variant="caption">
                    Avg Encoding Time
                  </Typography>
                  <Typography variant="h4">
                    {Math.round(avgEncodingTime / 60)}m
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Per video
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" variant="caption">
                    Success Rate
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {avgSuccessRate}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Overall performance
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" variant="caption">
                    Total Encoding Time
                  </Typography>
                  <Typography variant="h4">
                    {totalEncodingHours}h
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cumulative hours
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Charts */}
          <Grid container spacing={3}>
            {/* Jobs Over Time */}
            <Grid item xs={12} lg={8}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Encoding Activity Over Time
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="videos"
                      stroke="#8884d8"
                      name="Videos Encoded"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgTime"
                      stroke="#82ca9d"
                      name="Avg Time (min)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Quality Distribution */}
            <Grid item xs={12} lg={4}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Quality Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={qualityChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => `${entry.name} (${((entry.value / totalVideos) * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {qualityChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={QUALITY_COLORS[entry.name] || '#999'}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Encoder Performance */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Top Encoder Performance
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={encoderChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="jobs" fill="#8884d8" name="Jobs Completed" />
                    <Bar yAxisId="right" dataKey="avgTime" fill="#82ca9d" name="Avg Time (min)" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}