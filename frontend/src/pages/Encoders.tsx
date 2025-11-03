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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface Encoder {
  encoder_id: string;
  name: string;
  owner: string;
  location?: string;
  hardware_type?: string;
  is_active: boolean;
  created_at: Date;
  last_seen: Date;
}

interface EncoderFormData {
  encoder_id: string;
  name: string;
  owner: string;
  location: string;
  hardware_type: string;
}

export function Encoders() {
  const [encoders, setEncoders] = useState<Encoder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [editingEncoder, setEditingEncoder] = useState<Encoder | null>(null);
  const [deletingEncoder, setDeletingEncoder] = useState<Encoder | null>(null);
  const [formData, setFormData] = useState<EncoderFormData>({
    encoder_id: '',
    name: '',
    owner: '',
    location: '',
    hardware_type: '',
  });

  const fetchEncoders = async () => {
    try {
      setError(null);
      const response = await fetch('/api/encoders');
      const data = await response.json();
      
      if (data.success) {
        setEncoders(data.data);
      } else {
        setError(data.error || 'Failed to fetch encoders');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching encoders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEncoders();
    const interval = setInterval(fetchEncoders, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleOpenDialog = (encoder?: Encoder) => {
    if (encoder) {
      setEditingEncoder(encoder);
      setFormData({
        encoder_id: encoder.encoder_id,
        name: encoder.name,
        owner: encoder.owner,
        location: encoder.location || '',
        hardware_type: encoder.hardware_type || '',
      });
    } else {
      setEditingEncoder(null);
      setFormData({
        encoder_id: '',
        name: '',
        owner: '',
        location: '',
        hardware_type: '',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingEncoder(null);
  };

  const handleSubmit = async () => {
    try {
      const url = editingEncoder
        ? `/api/encoders/${editingEncoder.encoder_id}`
        : '/api/encoders';
      
      const method = editingEncoder ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        handleCloseDialog();
        fetchEncoders();
      } else {
        setError(data.error || 'Operation failed');
      }
    } catch (err) {
      setError('Failed to save encoder');
      console.error('Error saving encoder:', err);
    }
  };

  const handleDelete = async () => {
    if (!deletingEncoder) return;

    try {
      const response = await fetch(`/api/encoders/${deletingEncoder.encoder_id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setOpenDeleteDialog(false);
        setDeletingEncoder(null);
        fetchEncoders();
      } else {
        setError(data.error || 'Failed to delete encoder');
      }
    } catch (err) {
      setError('Failed to delete encoder');
      console.error('Error deleting encoder:', err);
    }
  };

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const activeEncoders = encoders.filter(e => e.is_active).length;
  const inactiveEncoders = encoders.length - activeEncoders;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Encoder Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchEncoders}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Encoder
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Encoders
              </Typography>
              <Typography variant="h3">
                {encoders.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Encoders
              </Typography>
              <Typography variant="h3" color="success.main">
                {activeEncoders}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Inactive Encoders
              </Typography>
              <Typography variant="h3" color="text.secondary">
                {inactiveEncoders}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Encoders Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : encoders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary">
            No encoders registered yet
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ mt: 2 }}
          >
            Add Your First Encoder
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Node Name</TableCell>
                <TableCell>Hive Account</TableCell>
                <TableCell>DID Key</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Seen</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Hardware</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {encoders.map((encoder) => (
                <TableRow key={encoder.encoder_id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {encoder.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{encoder.owner}</TableCell>
                  <TableCell>
                    <Tooltip title={encoder.encoder_id}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {encoder.encoder_id.substring(0, 20)}...
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={encoder.is_active ? 'Active' : 'Inactive'}
                      color={encoder.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatRelativeTime(encoder.last_seen)}</TableCell>
                  <TableCell>{encoder.location || '-'}</TableCell>
                  <TableCell>{encoder.hardware_type || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(encoder)}
                      color="primary"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setDeletingEncoder(encoder);
                        setOpenDeleteDialog(true);
                      }}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingEncoder ? 'Edit Encoder' : 'Add New Encoder'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Encoder ID (DID Key)"
              value={formData.encoder_id}
              onChange={(e) => setFormData({ ...formData, encoder_id: e.target.value })}
              disabled={!!editingEncoder}
              required
              fullWidth
              helperText={editingEncoder ? "ID cannot be changed" : "Enter the encoder's DID key"}
            />
            <TextField
              label="Node Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
              helperText="A human-readable name for this encoder"
            />
            <TextField
              label="Hive Account"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              required
              fullWidth
              helperText="The Hive account that owns this encoder"
            />
            <TextField
              label="Location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              fullWidth
              helperText="Optional: Physical location or region"
            />
            <TextField
              label="Hardware Type"
              value={formData.hardware_type}
              onChange={(e) => setFormData({ ...formData, hardware_type: e.target.value })}
              fullWidth
              helperText="Optional: Hardware specifications"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.encoder_id || !formData.name || !formData.owner}
          >
            {editingEncoder ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete encoder <strong>{deletingEncoder?.name}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}