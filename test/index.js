'use strict'
const { suite, test } = require('mocha')
const assert = require('assert')
const util = require('util')
const supertest = require('supertest')
const express = require('express')
const SwaggerParser = require('swagger-parser')
const openapi = require('../')

function logDocument (doc) {
  console.log(util.inspect(doc, { depth: null }))
}

suite('openapi_test', function () {
  test('accept no options', function () {
    const oapi = openapi()
    assert.strictEqual(oapi.routePrefix, openapi.defaultRoutePrefix)
    assert.deepStrictEqual(oapi.document, openapi.minimumViableDocument)
  })

  test('accept no document option', function () {
    const oapi = openapi('/test')
    assert.strictEqual(oapi.routePrefix, '/test')
    assert.deepStrictEqual(oapi.document, openapi.minimumViableDocument)
  })

  test('accept doc w/o path or opts', function () {
    const oapi = openapi({
      info: {
        version: '1.0.0',
        title: '@express/openapi'
      }
    })
    assert.strictEqual(oapi.routePrefix, '/openapi')
    assert.deepStrictEqual(oapi.document.info.title, '@express/openapi')
    assert.deepStrictEqual(oapi.options, {})
  })

  test('accept both a routePrefix and a document', function () {
    const oapi = openapi('/test', {
      info: {
        title: 'Test App'
      }
    })
    assert.strictEqual(oapi.routePrefix, '/test')
    assert.deepStrictEqual(oapi.document, {
      openapi: '3.0.0',
      info: {
        title: 'Test App',
        version: '1.0.0'
      },
      paths: {}
    })
  })

  test('create a basic valid OpenAPI document and serve test on an express app', function (done) {
    const app = express()
    app.use(openapi())
    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          assert(!err, err)
          assert.deepStrictEqual(api, openapi.minimumViableDocument)
          done()
        })
      })
  })

  test('create a basic valid Swagger UI document and check the HTML title', function (done) {
    const app = express()
    app.use(openapi().swaggerui)
    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .end((err, res) => {
        assert(!err, err)
        assert(res.text.includes('<title>Swagger UI</title>'))
        done()
      })
  })

  test('create a basic valid ReDoc document and check the HTML title', function (done) {
    const app = express()
    app.use(openapi().redoc)
    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .end((err, res) => {
        assert(!err, err)
        assert(res.text.includes('<title>ReDoc</title>'))
        done()
      })
  })

  test('load routes from the express app', function (done) {
    const app = express()
    const oapi = openapi()

    const helloWorldSchema = oapi.path({
      responses: {
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  hello: { type: 'string' }
                }
              }
            }
          }
        }
      }
    })

    app.use(oapi)
    app.get('/foo', helloWorldSchema, (req, res) => {
      res.json({
        hello: 'world'
      })
    })

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          assert(!err, err)
          done()
        })
      })
  })

  test('support express array formats', (done) => {
    const app = express()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': { }
          }
        }
      }
    })

    app.use(oapi)
    app.get('/undocumented', (req, res) => {
      res.status(204).send()
    })
    app.get('/array', [emptySchema, (req, res) => {
      res.status(204).send()
    }])
    app.get('/array-of-arrays', [[emptySchema, (req, res) => {
      res.status(204).send()
    }]])

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)
            done(err)
          }

          assert(api.paths['/array'])
          assert(api.paths['/array'].get)
          assert(api.paths['/array'].get.responses[204])
          assert.strictEqual(api.paths['/array'].get.responses[204].description, 'Successful response')

          assert(api.paths['/array-of-arrays'])
          assert(api.paths['/array-of-arrays'].get)
          assert(api.paths['/array-of-arrays'].get.responses[204])
          assert.strictEqual(api.paths['/array-of-arrays'].get.responses[204].description, 'Successful response')

          assert(!api.paths['/undocumented'])

          done()
        })
      })
  })

  test('support express route syntax', (done) => {
    const app = express()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': { }
          }
        }
      }
    })

    app.use(oapi)
    app.route('/route')
      .get(emptySchema, (req, res) => {
        res.status(204).send()
      })
      .put(emptySchema, (req, res) => {
        res.status(204).send()
      })

    app.route('/route-all')
      .all(emptySchema)
      .all((req, res) => {
        res.status(204).send()
      })

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)
            done(err)
          }

          assert(api.paths['/route'])
          assert(api.paths['/route'].get)
          assert(api.paths['/route'].get.responses[204])
          assert.strictEqual(api.paths['/route'].get.responses[204].description, 'Successful response')

          assert(api.paths['/route'].put)
          assert(api.paths['/route'].put.responses[204])
          assert.strictEqual(api.paths['/route'].put.responses[204].description, 'Successful response')

          done()
        })
      })
  })

  test('support named path params', (done) => {
    const app = express()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': { }
          }
        }
      }
    })

    app.use(oapi)
    app.get('/:foo', emptySchema, (req, res) => {
      res.status(204).send()
    })

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)
            done(err)
          }

          assert(api.paths['/{foo}'])
          assert(api.paths['/{foo}'].get)
          assert(api.paths['/{foo}'].get.parameters[0])
          assert.strictEqual(api.paths['/{foo}'].get.parameters[0].name, 'foo')

          done()
        })
      })
  })

  test('support parameter components', (done) => {
    const app = express()
    const oapi = openapi()

    oapi.parameters('id', {
      in: 'path',
      required: true,
      description: 'The entity id',
      schema: { type: 'string' }
    })

    app.use(oapi)
    app.get('/:id', oapi.path({
      description: 'Get thing by id',
      parameters: [oapi.parameters('id')],
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': { }
          }
        }
      }
    }), (req, res) => {
      res.status(204).send()
    })

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}/validate`)
      .expect(200, (err, res) => {
        assert(!err, err)
        assert.strictEqual(res.body.valid, true)
        assert.strictEqual(res.body.document.components.parameters.id.name, 'id')
        assert.strictEqual(res.body.document.components.parameters.id.description, 'The entity id')
        assert.strictEqual(res.status, 200)
        done()
      })
  })

  test('support express sub-routes with Router', (done) => {
    const app = express()
    const router = express.Router()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': {}
          }
        }
      }
    })

    router.get('/endpoint', emptySchema, (req, res) => {
      res.status(204).send()
    })

    app.use(oapi)
    app.use('/sub-route', router)

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)

            done(err)
          }

          assert(api.paths['/sub-route/endpoint'])
          assert(api.paths['/sub-route/endpoint'].get)
          assert(api.paths['/sub-route/endpoint'].get.responses[204])
          assert.strictEqual(
            api.paths['/sub-route/endpoint'].get.responses[204].description,
            'Successful response'
          )

          done()
        })
      })
  })

  test('support express nested sub-routes with Router', (done) => {
    const app = express()
    const router = express.Router()
    const subrouter = express.Router()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': {}
          }
        }
      }
    })

    subrouter.get('/endpoint', emptySchema, (req, res) => {
      res.status(204).send()
    })

    app.use(oapi)
    app.use('/sub-route', router)
    router.use('/sub-sub-route', subrouter)

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)

            done(err)
          }

          assert(api.paths['/sub-route/sub-sub-route/endpoint'])
          assert(api.paths['/sub-route/sub-sub-route/endpoint'].get)
          assert(api.paths['/sub-route/sub-sub-route/endpoint'].get.responses[204])
          assert.strictEqual(
            api.paths['/sub-route/sub-sub-route/endpoint'].get.responses[204].description,
            'Successful response'
          )

          done()
        })
      })
  })

  test('support express nested sub-routes with parameters Router', (done) => {
    const app = express()
    const router = express.Router()
    const subrouter = express.Router()
    const oapi = openapi()

    const emptySchema = oapi.path({
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': {}
          }
        }
      }
    })

    subrouter.get('/endpoint', emptySchema, (req, res) => {
      res.status(204).send()
    })

    app.use(oapi)
    app.use('/sub-route/:test1', router)
    router.use('/sub-sub-route/:test2/:test3', subrouter)

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)

            done(err)
          }

          assert(api.paths['/sub-route/{test1}/sub-sub-route/{test2}/{test3}/endpoint'])
          assert(api.paths['/sub-route/{test1}/sub-sub-route/{test2}/{test3}/endpoint'].get)
          assert(api.paths['/sub-route/{test1}/sub-sub-route/{test2}/{test3}/endpoint'].get.responses[204])
          assert.strictEqual(
            api.paths['/sub-route/{test1}/sub-sub-route/{test2}/{test3}/endpoint'].get.responses[204].description,
            'Successful response'
          )

          done()
        })
      })
  })

  test('support multiple reference parameters', (done) => {
    const app = express()
    const router = express.Router()
    const oapi = openapi()

    oapi.component('parameters', 'testy_1', {
      name: 'Test one',
      description: 'Test parameter one',
      in: 'path',
      schema: {
        type: 'string'
      }
    })
    oapi.component('parameters', 'testy_2', {
      name: 'Test two',
      description: 'Test parameter two',
      in: 'query',
      schema: {
        type: 'string'
      }
    })
    oapi.component('parameters', 'testy_3', {
      name: 'Test three',
      description: 'The first one will always work, lets add another ...',
      in: 'query',
      schema: {
        type: 'string'
      }
    })

    const schema = oapi.path({
      parameters: [
        { $ref: '#/components/parameters/testy_1' },
        { $ref: '#/components/parameters/testy_2' },
        { $ref: '#/components/parameters/testy_3' }
      ],
      responses: {
        204: {
          description: 'Successful response',
          content: {
            'application/json': {}
          }
        }
      }
    })

    router.get('/:testy_1', schema, (req, res) => {
      res.status(204).send()
    })

    app.use(oapi)
    app.use('/:unreferenced_param', router)

    supertest(app)
      .get(`${openapi.defaultRoutePrefix}.json`)
      .expect(200, (err, res) => {
        assert(!err, err)
        SwaggerParser.validate(res.body, (err, api) => {
          if (err) {
            logDocument(api)

            done(err)
          }

          assert(api.paths['/{unreferenced_param}/{testy_1}'])
          assert(api.paths['/{unreferenced_param}/{testy_1}'].get)
          assert(api.paths['/{unreferenced_param}/{testy_1}'].get.parameters)
          assert(api.paths['/{unreferenced_param}/{testy_1}'].get.parameters.length === 4)

          done()
        })
      })
  })

  // Other tests
  require('./_validate')()
  require('./_routes')()
})
