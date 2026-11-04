import { onRequestGet as __api_visit_js_onRequestGet } from "/home/claude/asahikasei_aek/functions/api/visit.js"
import { onRequestPost as __api_visit_js_onRequestPost } from "/home/claude/asahikasei_aek/functions/api/visit.js"
import { onRequest as ___middleware_js_onRequest } from "/home/claude/asahikasei_aek/functions/_middleware.js"

export const routes = [
    {
      routePath: "/api/visit",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_visit_js_onRequestGet],
    },
  {
      routePath: "/api/visit",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_visit_js_onRequestPost],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]