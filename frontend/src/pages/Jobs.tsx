import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  LinearProgress,
  Alert,
  CircularProgress,
  Link
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  HourglassEmpty
} from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`jobs-tabpanel-${index}`}
      aria-labelledby={`jobs-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface Job {
  id: string;
  _id?: string;
  created_at: string;
  status: string;
  metadata?: {
    video_owner: string;
    video_permlink: string;
  };
  owner?: string;
  permlink?: string;
  input?: {
    size: number;
  };
  input_size?: number;
  assigned_to?: string;
  assigned_date?: string;
  completed_at?: string;
  progress?: {
    pct: number;
  };
  result?: {
    message?: string;
  };
  totalDuration?: number;
  encodingDuration?: number;
  encoderInfo?: {
    nodeName: string;
    hiveAccount?: string;
    didKey: string;
  };
}

export function Jobs() {
  const [tabValue, setTabValue] = useState(0);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCompletedJobs, setTotalCompletedJobs] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format relative time
  const formatRelativeTime = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Format duration in seconds to readable string
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  };

  // Fetch jobs data
  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoints = [
        '/api/jobs/available',
        '/api/jobs/active',
        `/api/jobs/completed?page=${page + 1}&limit=${rowsPerPage}`
      ];

      const responses = await Promise.all(
        endpoints.map(endpoint => fetch(endpoint))
      );

      const data = await Promise.all(
        responses.map(response => response.json())
      );

      if (data[0].success) setAvailableJobs(data[0].data || []);
      if (data[1].success) setActiveJobs(data[1].data || []);
      if (data[2].success) {
        setCompletedJobs(data[2].data || []);
        setTotalCompletedJobs(data[2].pagination?.total || 0);
      }

    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('Failed to fetch jobs data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    // Auto-refresh based on active tab
    const intervals: NodeJS.Timeout[] = [];
    
    if (tabValue === 0) {
      // Available jobs - refresh every 10 seconds
      const interval = setInterval(fetchJobs, 10000);
      intervals.push(interval);
    } else if (tabValue === 1) {
      // Active jobs - refresh every 5 seconds
      const interval = setInterval(fetchJobs, 5000);
      intervals.push(interval);
    }

    return () => intervals.forEach(interval => clearInterval(interval));
  }, [tabValue, page, rowsPerPage]);

  if (loading && availableJobs.length === 0 && activeJobs.length === 0 && completedJobs.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Job Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="job tabs">
          <Tab 
            label={`Available (${availableJobs.length})`} 
            icon={<HourglassEmpty />} 
            iconPosition="start"
          />
          <Tab 
            label={`In Progress (${activeJobs.length})`} 
            icon={<CircularProgress size={20} />} 
            iconPosition="start"
          />
          <Tab 
            label={`Completed (${totalCompletedJobs})`} 
            icon={<CheckCircle />} 
            iconPosition="start"
          />
        </Tabs>

        {/* Available Jobs Tab */}
        <TabPanel value={tabValue} index={0}>
          {availableJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                No jobs waiting - all clear!
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Job ID</TableCell>
                    <TableCell>Video</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Waiting</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availableJobs.map((job) => {
                    const age = new Date().getTime() - new Date(job.created_at).getTime();
                    const isOld = age > 20 * 60 * 1000; // 20 minutes
                    
                    return (
                      <TableRow 
                        key={job.id}
                        sx={{ backgroundColor: isOld ? 'warning.light' : 'inherit' }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {job.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          {job.metadata?.video_owner || job.owner}/{job.metadata?.video_permlink || job.permlink}
                        </TableCell>
                        <TableCell>{formatFileSize(job.input?.size || job.input_size || 0)}</TableCell>
                        <TableCell>{formatRelativeTime(job.created_at)}</TableCell>
                        <TableCell>
                          {isOld && (
                            <Chip 
                              icon={<Warning />} 
                              label="Stuck" 
                              size="small" 
                              color="warning"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* In Progress Tab */}
        <TabPanel value={tabValue} index={1}>
          {activeJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                No active jobs
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Job ID</TableCell>
                    <TableCell>Video</TableCell>
                    <TableCell>Encoder</TableCell>
                    <TableCell width="20%">Progress</TableCell>
                    <TableCell>Elapsed</TableCell>
                    <TableCell>Size</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {job.id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {job.metadata?.video_owner || job.owner}/{job.metadata?.video_permlink || job.permlink}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {job.encoderInfo?.nodeName || (job.assigned_to ? job.assigned_to.substring(0, 20) + '...' : 'N/A')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={job.progress?.pct || 0} 
                            sx={{ flexGrow: 1 }}
                          />
                          <Typography variant="caption">
                            {job.progress?.pct || 0}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {job.assigned_date ? formatRelativeTime(job.assigned_date) : 'N/A'}
                      </TableCell>
                      <TableCell>{formatFileSize(job.input?.size || job.input_size || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Completed Jobs Tab */}
        <TabPanel value={tabValue} index={2}>
          {completedJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                No completed jobs yet
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Job ID</TableCell>
                      <TableCell>Video</TableCell>
                      <TableCell>Encoder</TableCell>
                      <TableCell>Hive Account</TableCell>
                      <TableCell>Completed</TableCell>
                      <TableCell>Total Duration</TableCell>
                      <TableCell>Encoding Time</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {completedJobs.map((job) => {
                      const isForced = job.result?.message?.includes('Force processed');
                      const totalDur = job.totalDuration || 0;
                      const durColor = totalDur < 300 ? 'success' : totalDur < 1800 ? 'warning' : 'error';
                      const videoOwner = job.metadata?.video_owner || job.owner;
                      const videoPermlink = job.metadata?.video_permlink || job.permlink;
                      
                      return (
                        <TableRow key={job.id}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {job.id.substring(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`https://3speak.tv/watch?v=${videoOwner}/${videoPermlink}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ textDecoration: 'none', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                            >
                              {videoOwner}/{videoPermlink}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {job.encoderInfo?.nodeName || (job.assigned_to ? job.assigned_to.substring(0, 20) + '...' : 'N/A')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {job.encoderInfo?.hiveAccount || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {job.completed_at ? formatRelativeTime(job.completed_at) : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={formatDuration(totalDur)} 
                              size="small" 
                              color={durColor}
                            />
                          </TableCell>
                          <TableCell>
                            {job.encodingDuration ? formatDuration(job.encodingDuration) : 'N/A'}
                          </TableCell>
                          <TableCell>{formatFileSize(job.input?.size || job.input_size || 0)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={isForced ? 'Forced' : 'Success'} 
                              size="small" 
                              color={isForced ? 'warning' : 'success'}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[25, 50, 100]}
                component="div"
                count={totalCompletedJobs}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
}