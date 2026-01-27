import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Link,
  Stack
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  VideoLibrary,
  Timer,
  Speed
} from '@mui/icons-material';

interface EmbedJob {
  _id: string;
  owner: string;
  permlink: string;
  status: 'completed' | 'failed' | 'processing';
  assignedWorker: string;
  encoderJobId: string;
  assignedAt: string;
  attemptCount: number;
  lastError: string | null;
  webhookReceivedAt?: string;
  createdAt: string;
  updatedAt: string;
  video?: {
    _id: string;
    frontend_app?: string;
    status: string;
    input_cid?: string;
    manifest_cid?: string;
    thumbnail_url?: string;
    short?: boolean;
    duration?: number;
    size?: number;
    encodingProgress?: number;
    embed_url?: string;
    processed?: boolean;
    views?: number;
  };
}

interface Stats {
  totalToday: number;
  completedToday: number;
  failedToday: number;
  encoderDistribution: Array<{ encoder: string; count: number }>;
  avgEncodingTimeMs: number;
}

export function DirectEncoding() {
  const [jobs, setJobs] = useState<EmbedJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [jobsResponse, statsResponse] = await Promise.all([
        fetch('/api/direct-encoding/jobs'),
        fetch('/api/direct-encoding/stats')
      ]);

      if (!jobsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const jobsData = await jobsResponse.json();
      const statsData = await statsResponse.json();

      if (jobsData.success) {
        setJobs(jobsData.data);
      }

      if (statsData.success) {
        setStats(statsData.data);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getEncodingTime = (job: EmbedJob) => {
    if (!job.assignedAt || !job.webhookReceivedAt) return null;
    const duration = new Date(job.webhookReceivedAt).getTime() - new Date(job.assignedAt).getTime();
    return formatDuration(duration);
  };

  const getStatusChip = (job: EmbedJob) => {
    const jobStatus = job.status;
    const videoStatus = job.video?.status;

    if (jobStatus === 'completed' && videoStatus === 'published') {
      return <Chip icon={<CheckCircle />} label="Success" color="success" size="small" />;
    } else if (jobStatus === 'completed' && videoStatus === 'failed') {
      return <Chip icon={<Warning />} label="Encoded (Publish Failed)" color="warning" size="small" />;
    } else if (jobStatus === 'failed') {
      return <Chip icon={<ErrorIcon />} label="Failed" color="error" size="small" />;
    } else if (jobStatus === 'completed' && !videoStatus) {
      return <Chip icon={<Timer />} label="Awaiting Enrichment" color="info" size="small" />;
    } else {
      return <Chip label={jobStatus} size="small" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getEncoderColor = (encoder: string) => {
    const colors: { [key: string]: string } = {
      'Eddie': '#1976d2',
      'Snapie': '#9c27b0',
      'default': '#757575'
    };
    return colors[encoder] || colors.default;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Direct Encoding
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <VideoLibrary color="primary" />
                  <Typography variant="h6">{stats.totalToday}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Jobs Today
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CheckCircle color="success" />
                  <Typography variant="h6">{stats.completedToday}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Completed Today
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ErrorIcon color="error" />
                  <Typography variant="h6">{stats.failedToday}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Failed Today
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Speed color="info" />
                  <Typography variant="h6">
                    {formatDuration(stats.avgEncodingTimeMs)}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Avg Encoding Time
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Encoder Distribution */}
      {stats && stats.encoderDistribution.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Encoder Workload
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {stats.encoderDistribution.map((item) => (
              <Chip
                key={item.encoder}
                label={`${item.encoder}: ${item.count}`}
                sx={{ 
                  backgroundColor: getEncoderColor(item.encoder), 
                  color: 'white',
                  fontWeight: 'bold'
                }}
              />
            ))}
          </Stack>
        </Paper>
      )}

      {/* Self-Healing Notice */}
      <Alert severity="info" sx={{ mb: 2 }}>
        This is a self-healing system. Errors may auto-resolve during processing.
      </Alert>

      {/* Jobs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Owner</TableCell>
              <TableCell>Video ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Encoder</TableCell>
              <TableCell>Source App</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Encoding Time</TableCell>
              <TableCell>Views</TableCell>
              <TableCell>Errors</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  No jobs found
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job._id} hover>
                  <TableCell>{job.owner}</TableCell>
                  <TableCell>
                    {job.video?.processed && job.video?.embed_url ? (
                      <Link
                        href={`https://snapie.io/${job.video.embed_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {job.permlink}
                      </Link>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {job.permlink}
                      </Typography>
                    )}
                    {job.video?.short && (
                      <Chip label="Short" size="small" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>{getStatusChip(job)}</TableCell>
                  <TableCell>
                    <Chip
                      label={job.assignedWorker}
                      size="small"
                      sx={{
                        backgroundColor: getEncoderColor(job.assignedWorker),
                        color: 'white'
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {job.video?.frontend_app ? (
                      <Chip label={job.video.frontend_app} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatFileSize(job.video?.size)}</TableCell>
                  <TableCell>
                    {getEncodingTime(job) || (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {job.video?.views !== undefined ? (
                      job.video.views
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {job.lastError ? (
                      <Tooltip title={job.lastError} arrow>
                        <Warning color="warning" fontSize="small" sx={{ cursor: 'pointer' }} />
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
