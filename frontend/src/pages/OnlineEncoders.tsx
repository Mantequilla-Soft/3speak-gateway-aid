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
  Avatar,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';

interface OnlineEncoder {
  didKey: string;
  nodeName: string;
  hiveAccount: string | null;
  peerId: string;
  lastSeen: string;
  firstSeen: string;
}

export function OnlineEncoders() {
  const [encoders, setEncoders] = useState<OnlineEncoder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnlineEncoders = async () => {
    try {
      setError(null);
      const response = await fetch('/api/encoders/online');
      const data = await response.json();
      
      if (data.success) {
        setEncoders(data.data);
      } else {
        setError(data.error || 'Failed to fetch online encoders');
      }
    } catch (err) {
      console.error('Error fetching online encoders:', err);
      setError('Failed to fetch online encoders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOnlineEncoders();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchOnlineEncoders, 60000);

    return () => clearInterval(interval);
  }, []);

  const getAvatarUrl = (hiveAccount: string | null): string | null => {
    if (!hiveAccount) return null;
    return `https://images.hive.blog/u/${hiveAccount}/avatar/small`;
  };

  const getRelativeTime = (dateString: string): string => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Who's Online
        </Typography>
        <Chip 
          label={`${encoders.length} encoder${encoders.length !== 1 ? 's' : ''} online`}
          color="success"
          variant="outlined"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {encoders.length === 0 && !error ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No encoders currently online
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Encoders are considered online if they've been seen in the last 5 minutes
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Encoder</TableCell>
                <TableCell>Hive Account</TableCell>
                <TableCell align="right">Last Seen</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {encoders.map((encoder) => (
                <TableRow key={encoder.didKey} hover>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar 
                        src={getAvatarUrl(encoder.hiveAccount) || undefined}
                        alt={encoder.nodeName}
                        sx={{ width: 40, height: 40 }}
                      >
                        {!encoder.hiveAccount && encoder.nodeName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          {encoder.nodeName}
                        </Typography>
                        <Typography 
                          variant="caption" 
                          color="text.secondary"
                          sx={{ 
                            fontFamily: 'monospace',
                            fontSize: '0.7rem'
                          }}
                        >
                          {encoder.didKey.substring(0, 20)}...
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {encoder.hiveAccount ? (
                      <Box>
                        <Typography variant="body2">
                          @{encoder.hiveAccount}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        No Hive account
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      {getRelativeTime(encoder.lastSeen)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box mt={2}>
        <Typography variant="caption" color="text.secondary">
          Auto-refreshes every minute • Encoders shown if seen within last 5 minutes
        </Typography>
      </Box>
    </Box>
  );
}
