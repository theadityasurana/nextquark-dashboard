# HireSwipe Mobile API Documentation

## Overview
This API provides real-time monitoring of job application progress for React Native mobile applications.

## Base URL
```
https://your-domain.com
```

---

## Endpoints

### 1. Get Application Queue
Fetch all applications with optional filtering and pagination.

**Endpoint:** `GET /api/applications/queue`

**Query Parameters:**
- `status` (optional): Filter by status - `queued`, `processing`, `completed`, `failed`
- `userId` (optional): Filter by user ID
- `limit` (optional): Number of results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Example Request:**
```bash
curl "https://your-domain.com/api/applications/queue?status=processing&limit=20&offset=0"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "app-123",
      "userId": "user-456",
      "jobId": "job-789",
      "companyId": "company-101",
      "status": "processing",
      "progressStep": 3,
      "totalSteps": 5,
      "stepDescription": "Filling personal details",
      "errorMessage": null,
      "startedAt": "2024-02-22T10:45:18Z",
      "completedAt": null,
      "createdAt": "2024-02-22T10:45:00Z",
      "user": {
        "id": "user-456",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1-555-123-4567",
        "location": "San Francisco, CA"
      },
      "job": {
        "id": "job-789",
        "title": "Senior Software Engineer",
        "location": "Mountain View, CA",
        "type": "Full-time",
        "salaryRange": "$180,000 - $250,000",
        "companyName": "Google",
        "portalUrl": "https://careers.google.com/apply/12345"
      },
      "company": {
        "id": "company-101",
        "name": "Google",
        "logoInitial": "G",
        "website": "google.com"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 2. Get Application Details
Fetch detailed information about a specific application including user biodata.

**Endpoint:** `GET /api/applications/{id}`

**Path Parameters:**
- `id` (required): Application ID

**Example Request:**
```bash
curl "https://your-domain.com/api/applications/app-123"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-123",
    "userId": "user-456",
    "jobId": "job-789",
    "companyId": "company-101",
    "status": "processing",
    "progressStep": 3,
    "totalSteps": 5,
    "stepDescription": "Filling personal details",
    "errorMessage": null,
    "duration": "2m 15s",
    "progressPercentage": 60,
    "startedAt": "2024-02-22T10:45:18Z",
    "completedAt": null,
    "createdAt": "2024-02-22T10:45:00Z",
    "user": {
      "id": "user-456",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1-555-123-4567",
      "location": "San Francisco, CA",
      "headline": "Senior Software Engineer",
      "resumeUrl": "https://storage.example.com/resume.pdf",
      "coverLetter": "Dear Hiring Manager..."
    },
    "job": {
      "id": "job-789",
      "title": "Senior Software Engineer",
      "location": "Mountain View, CA",
      "type": "Full-time",
      "salaryRange": "$180,000 - $250,000",
      "companyName": "Google",
      "portalUrl": "https://careers.google.com/apply/12345",
      "jobUrl": "https://careers.google.com/jobs/12345"
    },
    "company": {
      "id": "company-101",
      "name": "Google",
      "logoInitial": "G",
      "website": "google.com"
    }
  }
}
```

---

### 3. Get Application Progress (Real-time)
Fetch real-time progress updates for a specific application or all applications for a user.

**Endpoint:** `GET /api/applications/progress`

**Query Parameters:**
- `applicationId` (optional): Get progress for specific application
- `userId` (optional): Get progress for all applications of a user
- **Note:** At least one parameter is required

**Example Request:**
```bash
# Get progress for specific application
curl "https://your-domain.com/api/applications/progress?applicationId=app-123"

# Get progress for all user applications
curl "https://your-domain.com/api/applications/progress?userId=user-456"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "app-123",
    "userId": "user-456",
    "jobId": "job-789",
    "companyId": "company-101",
    "status": "processing",
    "progressStep": 3,
    "totalSteps": 5,
    "stepDescription": "Filling personal details",
    "errorMessage": null,
    "progressPercentage": 60,
    "startedAt": "2024-02-22T10:45:18Z",
    "completedAt": null,
    "createdAt": "2024-02-22T10:45:00Z"
  },
  "timestamp": "2024-02-22T10:47:33Z"
}
```

---

## React Native Integration

### Installation
```bash
npm install react-native-fetch-blob
# or use built-in fetch API
```

### Usage Example

#### 1. Monitor Application Queue
```javascript
import { useApplicationQueue } from '@/hooks/use-application-monitoring'

export function ApplicationQueueScreen() {
  const { applications, loading, error, pagination, refetch } = useApplicationQueue({
    apiUrl: 'https://your-domain.com',
    status: 'processing',
    pollInterval: 3000, // Poll every 3 seconds
    limit: 20,
  })

  if (loading) return <Text>Loading...</Text>
  if (error) return <Text>Error: {error}</Text>

  return (
    <FlatList
      data={applications}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View>
          <Text>{item.user?.name}</Text>
          <Text>{item.job?.title}</Text>
          <ProgressBar value={item.progressPercentage} />
          <Text>{item.stepDescription}</Text>
        </View>
      )}
      onEndReached={() => refetch(pagination.offset + pagination.limit)}
    />
  )
}
```

#### 2. Monitor Single Application Progress
```javascript
import { useApplicationProgress } from '@/hooks/use-application-monitoring'

export function ApplicationProgressScreen({ applicationId }) {
  const { progress, loading, error } = useApplicationProgress({
    apiUrl: 'https://your-domain.com',
    applicationId,
    pollInterval: 2000, // Poll every 2 seconds
  })

  if (loading) return <Text>Loading...</Text>
  if (error) return <Text>Error: {error}</Text>

  return (
    <View>
      <Text>Status: {progress?.status}</Text>
      <ProgressBar value={progress?.progressPercentage} />
      <Text>Step {progress?.progressStep}/{progress?.totalSteps}</Text>
      <Text>{progress?.stepDescription}</Text>
    </View>
  )
}
```

#### 3. View Application Details
```javascript
import { useApplicationDetails } from '@/hooks/use-application-monitoring'

export function ApplicationDetailsScreen({ applicationId }) {
  const { details, loading, error } = useApplicationDetails({
    apiUrl: 'https://your-domain.com',
    applicationId,
  })

  if (loading) return <Text>Loading...</Text>
  if (error) return <Text>Error: {error}</Text>

  return (
    <ScrollView>
      <Text>{details?.user?.name}</Text>
      <Text>{details?.job?.title} at {details?.company?.name}</Text>
      <ProgressBar value={details?.progressPercentage} />
      <Text>Duration: {details?.duration}</Text>
      <Text>Status: {details?.status}</Text>
      {details?.errorMessage && <Text>Error: {details.errorMessage}</Text>}
    </ScrollView>
  )
}
```

---

## Status Values
- `queued`: Application waiting to be processed
- `processing`: Application is being submitted
- `completed`: Application successfully submitted
- `failed`: Application submission failed

---

## Error Handling

All endpoints return error responses in this format:
```json
{
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad request (missing required parameters)
- `404`: Application not found
- `500`: Server error

---

## Rate Limiting
- Recommended polling interval: 2-3 seconds for real-time updates
- Maximum requests: 100 per minute per IP
- Recommended limit per request: 50 applications

---

## Best Practices

1. **Polling Interval**: Use 2-3 second intervals for real-time feel without overloading server
2. **Pagination**: Use pagination for large datasets
3. **Error Handling**: Always handle network errors gracefully
4. **Caching**: Cache application list locally to reduce API calls
5. **Background Updates**: Use background tasks to keep progress updated even when app is minimized

---

## Example React Native Component

```javascript
import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ProgressViewIOS,
  StyleSheet,
} from 'react-native'
import { useApplicationQueue } from '@/hooks/use-application-monitoring'

export function LiveQueueScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const { applications, loading, error, refetch } = useApplicationQueue({
    apiUrl: 'https://your-domain.com',
    pollInterval: 3000,
  })

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (loading && !applications.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size=\"large\" />
      </View>
    )
  }

  return (
    <FlatList
      data={applications}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.name}>{item.user?.name}</Text>
            <Text style={styles.status}>{item.status}</Text>
          </View>
          <Text style={styles.job}>{item.job?.title}</Text>
          <Text style={styles.company}>{item.company?.name}</Text>
          <ProgressViewIOS
            progress={item.progressPercentage / 100}
            style={styles.progress}
          />
          <Text style={styles.step}>
            Step {item.progressStep}/{item.totalSteps}: {item.stepDescription}
          </Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  name: { fontSize: 16, fontWeight: 'bold' },
  status: { fontSize: 12, color: '#666' },
  job: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  company: { fontSize: 12, color: '#999', marginBottom: 8 },
  progress: { height: 4, marginBottom: 8 },
  step: { fontSize: 12, color: '#666' },
})
```

---

## Support
For issues or questions, contact: support@hireswipe.com
