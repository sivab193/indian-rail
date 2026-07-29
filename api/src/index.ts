import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'

type Bindings = {
  DB: D1Database
}

const app = new OpenAPIHono<{ Bindings: Bindings }>()

// --- Zod Schemas for OpenAPI Validation & Types ---

const TrainSchema = z.object({
  train_number: z.string().openapi({ example: '12951' }),
  train_name: z.string().openapi({ example: 'Mumbai Rajdhani' }),
})

const RouteStopSchema = z.object({
  arrival_time: z.string().nullable().openapi({ example: '08:32' }),
  departure_time: z.string().nullable().openapi({ example: '08:35' }),
  stop_sequence: z.number().openapi({ example: 1 }),
  station_code: z.string().openapi({ example: 'NDLS' }),
  station_name: z.string().openapi({ example: 'New Delhi' }),
})

const LiveTrainSchema = z.object({
  train_number: z.string().openapi({ example: '12951' }),
  train_name: z.string().openapi({ example: 'Mumbai Rajdhani' }),
  arrival_time: z.string().nullable().openapi({ example: '08:32' }),
  departure_time: z.string().nullable().openapi({ example: '08:35' }),
})

// --- Routes Definition ---

const getTrainRoute = createRoute({
  method: 'get',
  path: '/api/trains/{number}',
  summary: 'Get train details',
  description: 'Fetches the details of a specific Indian Railways train by its 5-digit number.',
  request: {
    params: z.object({
      number: z.string().min(5).max(5).openapi({ example: '12951' })
    })
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ train: TrainSchema }) } },
      description: 'Train found'
    },
    404: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'Train not found'
    }
  }
})

const getTrainScheduleRoute = createRoute({
  method: 'get',
  path: '/api/trains/{number}/route',
  summary: 'Get full train route and schedule',
  description: 'Fetches the entire chronological route, stops, and schedule for a specific train.',
  request: {
    params: z.object({
      number: z.string().min(5).max(5).openapi({ example: '12951' })
    })
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ route: z.array(RouteStopSchema) }) } },
      description: 'Successful route retrieval'
    }
  }
})

const getLiveStationRoute = createRoute({
  method: 'get',
  path: '/api/stations/{code}/live',
  summary: 'Get live station departures',
  description: 'Acts as a live departure board, fetching all trains passing through a specific station code.',
  request: {
    params: z.object({
      code: z.string().openapi({ example: 'NDLS' })
    })
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ station: z.string(), trains: z.array(LiveTrainSchema) }) } },
      description: 'Successful station board retrieval'
    }
  }
})

// --- Handlers ---

app.openapi(getTrainRoute, async (c) => {
  const { number } = c.req.valid('param')
  const { results } = await c.env.DB.prepare('SELECT * FROM Trains WHERE train_number = ?').bind(number).all()
  if (results.length === 0) return c.json({ error: 'Train not found' }, 404)
  return c.json({ train: results[0] as z.infer<typeof TrainSchema> }, 200)
})

app.openapi(getTrainScheduleRoute, async (c) => {
  const { number } = c.req.valid('param')
  const { results } = await c.env.DB.prepare(`
    SELECT t.arrival_time, t.departure_time, t.stop_sequence, s.station_code, s.station_name
    FROM TrainSchedules t 
    JOIN Stations s ON t.station_code = s.station_code 
    WHERE t.train_number = ? 
    ORDER BY t.stop_sequence ASC
  `).bind(number).all()
  return c.json({ route: results as z.infer<typeof RouteStopSchema>[] }, 200)
})

app.openapi(getLiveStationRoute, async (c) => {
  const code = c.req.valid('param').code.toUpperCase()
  const { results } = await c.env.DB.prepare(`
    SELECT t.train_number, tr.train_name, t.arrival_time, t.departure_time 
    FROM TrainSchedules t 
    JOIN Trains tr ON t.train_number = tr.train_number 
    WHERE t.station_code = ? 
    ORDER BY t.arrival_time ASC
  `).bind(code).all()
  return c.json({ station: code, trains: results as z.infer<typeof LiveTrainSchema>[] }, 200)
})

// --- OpenAPI & UI Setup ---

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Indian Railways NTES API (MCP Compatible)',
    description: 'An API to query trains, routes, and live station boards. Fully compatible as an MCP Server.',
  },
})

app.get('/', swaggerUI({ url: '/openapi.json' }))

export default app
