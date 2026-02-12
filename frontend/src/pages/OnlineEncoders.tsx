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
  IconButton,
  Tooltip,
} from '@mui/material';
import { Block as BlockIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

interface OnlineEncoder {
  didKey: string;
  nodeName: string;
  hiveAccount: string | null;
  peerId: string;
  lastSeen: string;
  firstSeen: string;
  banned: boolean;
}

export function OnlineEncoders() {
  const [encoders, setEncoders] = useState<OnlineEncoder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingBan, setUpdatingBan] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

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

  const handleBanToggle = async (didKey: string, currentBanned: boolean) => {
    setUpdatingBan(didKey);
    try {
      const response = await fetch(`/api/encoders/${encodeURIComponent(didKey)}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ banned: !currentBanned }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state immediately
        setEncoders(prev => prev.map(enc => 
          enc.didKey === didKey ? { ...enc, banned: !currentBanned } : enc
        ));
      } else {
        setError(data.error || 'Failed to update ban status');
      }
    } catch (err) {
      console.error('Error updating ban status:', err);
      setError('Failed to update ban status');
    } finally {
      setUpdatingBan(null);
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
                <TableCell>Status</TableCell>
                <TableCell>Encoder</TableCell>
                <TableCell>Hive Account</TableCell>
                <TableCell align="right">Last Seen</TableCell>
                {isAuthenticated && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {encoders.map((encoder) => (
                <TableRow key={encoder.didKey} hover>
                  <TableCell>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: encoder.banned ? '#f44336' : '#4caf50',
                        boxShadow: encoder.banned 
                          ? '0 0 8px rgba(244, 67, 54, 0.6)'
                          : '0 0 8px rgba(76, 175, 80, 0.6)',
                      }}
                    />
                  </TableCell>
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
                  {isAuthenticated && (
                    <TableCell align="center">
                      <Tooltip title={encoder.banned ? 'Unban encoder' : 'Ban encoder'}>
                        <IconButton
                          size="small"
                          onClick={() => handleBanToggle(encoder.didKey, encoder.banned)}
                          disabled={updatingBan === encoder.didKey}
                          color={encoder.banned ? 'success' : 'error'}
                        >
                          {updatingBan === encoder.didKey ? (
                            <CircularProgress size={20} />
                          ) : encoder.banned ? (
                            <CheckCircleIcon />
                          ) : (
                            <BlockIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
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
