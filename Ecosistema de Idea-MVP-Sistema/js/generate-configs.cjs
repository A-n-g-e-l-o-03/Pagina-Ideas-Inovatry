#!/usr/bin/env node
/**
 * Config Generator — Genera configs de fase para Ecosistema Idea-MVP
 * Ejecutar: node js/generate-configs.js
 */

const fs = require('fs');
const path = require('path');

// ======== Configuración ========
const OUTPUT_DIR = path.join(__dirname, '../configs/phases');
const SCHEMA_PATH = path.join(__dirname, '../js/core/phase-config-schema.json');

// ======== Definiciones de Fases (Source of Truth) ========
const PHASE_DEFINITIONS = [
  // 01-IDD: 8 core + 5 proyecciones = 13
  { phaseId: '01-idd', phaseGroup: 'idd', order: 1, variants: [
    { id: 'mercado', name: 'IDD — Mercado', hero: { title: 'IDD — Mercado', description: 'La idea inicial orientada a oportunidad de mercado: problema, entorno, visión, misión, objetivos y alcance.', badge: '5 preguntas' } },
    { id: 'productividad', name: 'IDD — Productividad Equipo', hero: { title: 'IDD — Productividad Equipo', description: 'La idea inicial filtrada por ROI en productividad del equipo: fricciones, capacidad, métricas y dinámicas de colaboración.', badge: '5 preguntas' } },
    { id: 'operativa', name: 'IDD — Operativa', hero: { title: 'IDD — Operativa', description: 'La idea inicial filtrada por flujo operativo: lead time, throughput, WIP, cuellos de botella y desperdicios Lean.', badge: '5 preguntas' } },
    { id: 'humana', name: 'IDD — Humana', hero: { title: 'IDD — Humana', description: 'La idea inicial filtrada por carga cognitiva y bienestar: foco profundo, context-switch, energía del equipo, sostenibilidad humana.', badge: '5 preguntas' } },
    { id: 'economica', name: 'IDD — Económica', hero: { title: 'IDD — Económica', description: 'La idea inicial filtrada por retorno económico: costo de no hacer, horas liberadas, payback, ROI de productividad.', badge: '5 preguntas' } },
    { id: 'tecnica', name: 'IDD — Técnica', hero: { title: 'IDD — Técnica', description: 'La idea inicial filtrada por fricción toolchain: automatización, deuda técnica, CI/CD, calidad, trabajo manual eliminable.', badge: '5 preguntas' } },
    { id: 'colaborativa', name: 'IDD — Colaborativa', hero: { title: 'IDD — Colaborativa', description: 'La idea inicial filtrada por handoffs y ownership: dependencias, contratos, comunicación async, estructura de equipos.', badge: '5 preguntas' } },
    { id: 'evolutiva', name: 'IDD — Evolutiva', hero: { title: 'IDD — Evolutiva', description: 'La idea inicial filtrada por escalabilidad y sostenibilidad: bus factor, onboarding, learning org, reversibilidad, fundaciones.', badge: '5 preguntas' } },
    // Proyecciones
    { id: 'legal', name: 'IDD — Legal/Regulatorio', hero: { title: 'IDD — Legal/Regulatorio', description: 'La idea inicial filtrada por cumplimiento normativo: GDPR, PCI-DSS, LGPD, auditorías, privacidad, contratos.', badge: '5 preguntas' }, projection: true },
    { id: 'seguridad', name: 'IDD — Seguridad', hero: { title: 'IDD — Seguridad', description: 'La idea inicial filtrada por postura de seguridad: threat modeling, zero trust, controles, superficie de ataque.', badge: '5 preguntas' }, projection: true },
    { id: 'ux', name: 'IDD — UX/Cliente', hero: { title: 'IDD — UX/Cliente', description: 'La idea inicial filtrada por experiencia de usuario: usabilidad, accesibilidad, journey, adopción, valor percibido.', badge: '5 preguntas' }, projection: true },
    { id: 'data', name: 'IDD — Data/ML', hero: { title: 'IDD — Data/ML', description: 'La idea inicial filtrada por factibilidad data-driven: data readiness, ML viability, drift, governance, feature store.', badge: '5 preguntas' }, projection: true },
    { id: 'plataforma', name: 'IDD — Plataforma/Infra', hero: { title: 'IDD — Plataforma/Infra', description: 'La idea inicial filtrada por impacto en plataforma compartida: DX, golden paths, standards, leverage, self-service.', badge: '5 preguntas' }, projection: true }
  ]},
  // 02-PRD: 4 core + 2 proyecciones = 6
  { phaseId: '02-prd', phaseGroup: 'rdd', order: 2, variants: [
    { id: 'usuario', name: 'PRD — Usuario', hero: { title: 'PRD — Usuario', description: 'El producto desde la perspectiva del usuario final: problemas, necesidades, flujos, valor percibido.', badge: '5 preguntas' } },
    { id: 'producto', name: 'PRD — Producto', hero: { title: 'PRD — Producto', description: 'El producto como activo gestionable: roadmap, métricas, priorización, ciclo de vida.', badge: '5 preguntas' } },
    { id: 'negocio', name: 'PRD — Negocio', hero: { title: 'PRD — Negocio', description: 'El producto en lenguaje de negocio: ROI, mercado, unidad económica, estrategia.', badge: '5 preguntas' } },
    { id: 'tecnico', name: 'PRD — Técnico', hero: { title: 'PRD — Técnico', description: 'El producto en factibilidad técnica: arquitectura, stack, deuda, riesgos, estimación.', badge: '5 preguntas' } },
    { id: 'plataforma', name: 'PRD — Plataforma', hero: { title: 'PRD — Plataforma', description: 'Producto de plataforma interna: developer experience, golden paths, self-service, leverage.', badge: '5 preguntas' }, projection: true },
    { id: 'data', name: 'PRD — Data/Analytics', hero: { title: 'PRD — Data/Analytics', description: 'Producto de datos: dashboards, ML features, data APIs, self-serve analytics.', badge: '5 preguntas' }, projection: true }
  ]},
  // 03-BRD: 4 core + 2 proyecciones = 6
  { phaseId: '03-brd', phaseGroup: 'rdd', order: 3, variants: [
    { id: 'estrategia', name: 'BRD — Estrategia', hero: { title: 'BRD — Estrategia', description: 'Necesidades de negocio desde perspectiva estratégica: dirección, posicionamiento, ventajas competitivas.', badge: '5 preguntas' } },
    { id: 'operaciones', name: 'BRD — Operaciones', hero: { title: 'BRD — Operaciones', description: 'Necesidades de negocio desde perspectiva operativa: eficiencia, costos, procesos, escalabilidad.', badge: '5 preguntas' } },
    { id: 'financiero', name: 'BRD — Financiero', hero: { title: 'BRD — Financiero', description: 'Necesidades de negocio en lenguaje financiero: inversión, retorno, riesgo, capital efficiency.', badge: '5 preguntas' } },
    { id: 'regulatorio', name: 'BRD — Regulatorio', hero: { title: 'BRD — Regulatorio', description: 'Necesidades de negocio desde cumplimiento: obligaciones legales, riesgo regulatorio, auditoría.', badge: '5 preguntas' } },
    { id: 'sostenibilidad', name: 'BRD — Sostenibilidad/ESG', hero: { title: 'BRD — Sostenibilidad/ESG', description: 'Necesidades de negocio desde perspectiva ESG: impacto ambiental, social, gobernanza.', badge: '5 preguntas' }, projection: true },
    { id: 'talento', name: 'BRD — Talento/Organización', hero: { title: 'BRD — Talento/Organización', description: 'Necesidades de negocio desde perspectiva de gente: capacidades, cultura, retención, employer brand.', badge: '5 preguntas' }, projection: true }
  ]},
  // 04-RDD: 3 core + 2 proyecciones = 5
  { phaseId: '04-rdd', phaseGroup: 'rdd', order: 4, variants: [
    { id: 'funcional', name: 'RDD — Funcional', hero: { title: 'RDD — Funcional', description: 'Requisitos funcionales: casos de uso, flujos, reglas, estados, APIs, criterios de aceptación.', badge: '6 preguntas' } },
    { id: 'no-funcional', name: 'RDD — No Funcional', hero: { title: 'RDD — No Funcional', description: 'Requisitos no funcionales: performance, escalabilidad, disponibilidad, seguridad, observabilidad, mantenibilidad.', badge: '6 preguntas' } },
    { id: 'seguridad', name: 'RDD — Seguridad', hero: { title: 'RDD — Seguridad', description: 'Requisitos de seguridad: threat modeling, zero trust, controles, compliance, incident response.', badge: '5 preguntas' } },
    { id: 'plataforma', name: 'RDD — Plataforma', hero: { title: 'RDD — Plataforma', description: 'Requisitos de plataforma interna: golden paths, self-service, APIs, contratos, multi-tenancy.', badge: '5 preguntas' }, projection: true },
    { id: 'data', name: 'RDD — Data/ML', hero: { title: 'RDD — Data/ML', description: 'Requisitos de productos de datos: pipelines, models, features, governance, SLAs, feature store.', badge: '5 preguntas' }, projection: true }
  ]},
  // 05-DMD: 2 core + 2 proyecciones = 4
  { phaseId: '05-dmd', phaseGroup: 'diseno', order: 5, variants: [
    { id: 'dominio', name: 'DMD — Dominio', hero: { title: 'DMD — Dominio', description: 'Modelo de dominio rico: aggregates, entities, value objects, domain events, invariants, repositories.', badge: '5 preguntas' } },
    { id: 'eventos', name: 'DMD — Eventos/Event Sourcing', hero: { title: 'DMD — Eventos/Event Sourcing', description: 'Modelo de dominio basado en eventos: event store, projections, snapshots, replay, process managers.', badge: '5 preguntas' } },
    { id: 'anemico', name: 'DMD — Anémico/Transaccional', hero: { title: 'DMD — Anémico/Transaccional', description: 'Modelo de dominio anémico: entities como DTOs, transaction scripts, services con lógica.', badge: '5 preguntas' }, projection: true },
    { id: 'data-mesh', name: 'DMD — Data Mesh', hero: { title: 'DMD — Data Mesh', description: 'Modelo de dominio para Data Mesh: data products, ownership, self-serve platform, federated governance.', badge: '5 preguntas' }, projection: true }
  ]},
  // 06-Design: 4 core + 2 proyecciones = 6
  { phaseId: '06-design', phaseGroup: 'diseno', order: 6, variants: [
    { id: 'arquitectura', name: 'Design — Arquitectura', hero: { title: 'Design — Arquitectura', description: 'Arquitectura de alto nivel: estilo, principios, bounded contexts, quality attributes, ADRs.', badge: '5 preguntas' } },
    { id: 'componentes', name: 'Design — Componentes', hero: { title: 'Design — Componentes', description: 'Diseño detallado de componentes: responsabilidades, interfaces, estado, ciclo de vida, testing.', badge: '5 preguntas' } },
    { id: 'datos', name: 'Design — Datos', hero: { title: 'Design — Datos', description: 'Diseño de datos: modelo lógico/físico, polyglot persistence, migración, consistencia, CQRS/ES.', badge: '5 preguntas' } },
    { id: 'seguridad', name: 'Design — Seguridad', hero: { title: 'Design — Seguridad', description: 'Arquitectura de seguridad: zero trust, identity, network, data protection, appsec, supply chain.', badge: '5 preguntas' } },
    { id: 'observabilidad', name: 'Design — Observabilidad', hero: { title: 'Design — Observabilidad', description: 'Diseño observabilidad: logging, metrics, tracing, alerting, dashboards, SLOs, cost optimization.', badge: '5 preguntas' }, projection: true },
    { id: 'plataforma', name: 'Design — Plataforma', hero: { title: 'Design — Plataforma', description: 'Arquitectura plataforma: control/data plane, golden paths, self-service, multi-tenancy, GitOps, upgrade.', badge: '5 preguntas' }, projection: true }
  ]},
  // 07-DBD: 2 core + 1 proyección = 3
  { phaseId: '07-dbd', phaseGroup: 'tecnico', order: 7, variants: [
    { id: 'relacional', name: 'DBD — Relacional', hero: { title: 'DBD — Relacional', description: 'Diseño relacional: esquema, migraciones, índices, particionado, concurrencia, auditoría, backup/HA.', badge: '5 preguntas' } },
    { id: 'nosql', name: 'DBD — NoSQL/Document', hero: { title: 'DBD — NoSQL/Document', description: 'Diseño NoSQL/document: embedding vs referencing, access patterns, particionado, consistencia, TTL.', badge: '5 preguntas' } },
    { id: 'timeseries', name: 'DBD — Time-Series/Analytics', hero: { title: 'DBD — Time-Series/Analytics', description: 'Diseño TSDB/OLAP: chunking, compression, continuous aggregates, retention tiering, downsampling.', badge: '5 preguntas' }, projection: true }
  ]},
  // 08-API: 2 core + 1 proyección = 3
  { phaseId: '08-api', phaseGroup: 'tecnico', order: 8, variants: [
    { id: 'rest', name: 'API — REST', hero: { title: 'API — REST', description: 'Contrato REST/HTTP: recursos, verbos, status codes, versionado, paginación, caching, rate limiting.', badge: '5 preguntas' } },
    { id: 'graphql', name: 'API — GraphQL', hero: { title: 'API — GraphQL', description: 'Contrato GraphQL: schema, federation, subscriptions, complexity analysis, authZ.', badge: '5 preguntas' } },
    { id: 'async', name: 'API — Async/Event-Driven', hero: { title: 'API — Async/Event-Driven', description: 'Contrato async: eventos, comandos, topics, schemas, delivery guarantees, idempotency, dead letter.', badge: '5 preguntas' }, projection: true }
  ]},
  // 09-UID: 2 core + 1 proyección = 3
  { phaseId: '09-uid', phaseGroup: 'diseno', order: 9, variants: [
    { id: 'web', name: 'UID — Web', hero: { title: 'UID — Web', description: 'Interfaz web: responsive, accessibility, Core Web Vitals, design system, state management, routing.', badge: '5 preguntas' } },
    { id: 'mobile', name: 'UID — Mobile', hero: { title: 'UID — Mobile', description: 'Interfaz móvil: platform guidelines, offline-first, push, biometrics, app store compliance, deep linking.', badge: '5 preguntas' } },
    { id: 'design-system', name: 'UID — Design System', hero: { title: 'UID — Design System', description: 'Design System como producto: tokens, components, governance, adoption, tooling, theming, quality gates.', badge: '5 preguntas' }, projection: true }
  ]},
  // 10-TMD: 2 core + 1 proyección = 3
  { phaseId: '10-tmd', phaseGroup: 'validacion', order: 10, variants: [
    { id: 'stride', name: 'TMD — STRIDE', hero: { title: 'TMD — STRIDE', description: 'Threat modeling STRIDE: DFDs, threat enumeration, risk assessment, mitigation mapping, residual risk.', badge: '5 preguntas' } },
    { id: 'attack-trees', name: 'TMD — Attack Trees', hero: { title: 'TMD — Attack Trees', description: 'Attack trees para amenazas críticas: quantitative analysis, mitigation ROI, sensitivity analysis.', badge: '5 preguntas' } },
    { id: 'cloud', name: 'TMD — Cloud/Kubernetes', hero: { title: 'TMD — Cloud/Kubernetes', description: 'Threat model cloud-native: shared responsibility, k8s, serverless, managed services, supply chain, runtime.', badge: '5 preguntas' }, projection: true }
  ]},
  // 11-SRD: 2 core + 1 proyección = 3
  { phaseId: '11-srd', phaseGroup: 'validacion', order: 11, variants: [
    { id: 'appsec', name: 'SRD — AppSec', hero: { title: 'SRD — AppSec', description: 'Controles aplicación: OWASP Top 10, ASVS, secure coding, auth, session, crypto, dependencies, testing gates.', badge: '5 preguntas' } },
    { id: 'infra', name: 'SRD — Infra', hero: { title: 'SRD — Infra', description: 'Controles infra: network, host/container, k8s, cloud, supply chain, secrets, data protection, compliance automation.', badge: '5 preguntas' } },
    { id: 'compliance', name: 'SRD — Compliance', hero: { title: 'SRD — Compliance', description: 'Controles derivados de frameworks: PCI-DSS, GDPR, SOX, HIPAA, ISO 27001, evidence automation.', badge: '5 preguntas' }, projection: true }
  ]},
  // 12-IAM: 2 core + 1 proyección = 3
  { phaseId: '12-iam', phaseGroup: 'validacion', order: 12, variants: [
    { id: 'rbac', name: 'IAM — RBAC', hero: { title: 'IAM — RBAC', description: 'Control de acceso basado en roles: role hierarchy, permissions, SoD, dynamic roles, provisioning, audit.', badge: '5 preguntas' } },
    { id: 'zero-trust', name: 'IAM — Zero Trust', hero: { title: 'IAM — Zero Trust', description: 'Zero Trust: identity-aware proxy, device trust, PDP/PEP, micro-segmentation, continuous verification.', badge: '5 preguntas' } },
    { id: 'pam', name: 'IAM — PAM', hero: { title: 'IAM — PAM', description: 'Privileged Access Management: JIT elevation, session recording, credential vaulting, break-glass, vendor access.', badge: '5 preguntas' }, projection: true }
  ]},
  // 13-SAD: 2 core + 1 proyección = 3
  { phaseId: '13-sad', phaseGroup: 'validacion', order: 13, variants: [
    { id: 'zero-trust', name: 'SAD — Zero Trust', hero: { title: 'SAD — Zero Trust', description: 'Arquitectura Zero Trust: trust boundaries, PEPs/PDPs, data flows, identity/device integration, migration.', badge: '5 preguntas' } },
    { id: 'cloud', name: 'SAD — Cloud Native', hero: { title: 'SAD — Cloud Native', description: 'Arquitectura seguridad cloud: shared responsibility, k8s, serverless, managed services, supply chain, detection.', badge: '5 preguntas' } },
    { id: 'compliance', name: 'SAD — Compliance', hero: { title: 'SAD — Compliance', description: 'Arquitectura seguridad alineada a frameworks: PCI-DSS, GDPR, SOX, HIPAA, ISO 27001, NIST.', badge: '5 preguntas' }, projection: true }
  ]},
  // 14-AGD: 2 core + 1 proyección = 3
  { phaseId: '14-agd', phaseGroup: 'mcp', order: 14, variants: [
    { id: 'code-agent', name: 'AGD — Code Agent', hero: { title: 'AGD — Code Agent', description: 'Agente generador de código: stack, patterns, testing, quality gates, code review criteria, context management.', badge: '5 preguntas' } },
    { id: 'test-agent', name: 'AGD — Test Agent', hero: { title: 'AGD — Test Agent', description: 'Agente de testing: generation, execution, flakiness, coverage, test data, reporting, test pyramid.', badge: '5 preguntas' } },
    { id: 'review-agent', name: 'AGD — Review Agent', hero: { title: 'AGD — Review Agent', description: 'Agente de code review: security, performance, architecture, maintainability, auto-fix, false positive management.', badge: '5 preguntas' }, projection: true }
  ]},
  // 15-AAD: 2 core + 1 proyección = 3
  { phaseId: '15-aad', phaseGroup: 'mcp', order: 15, variants: [
    { id: 'pipeline', name: 'AAD — Pipeline', hero: { title: 'AAD — Pipeline', description: 'Arquitectura agentes pipeline CI/CD: stages, agents, gates, parallelization, rollback, feedback loops.', badge: '5 preguntas' } },
    { id: 'event-driven', name: 'AAD — Event-Driven', hero: { title: 'AAD — Event-Driven', description: 'Arquitectura agentes event-driven: event bus, choreography, saga, idempotency, dead letter, observability.', badge: '5 preguntas' } },
    { id: 'hierarchical', name: 'AAD — Hierarchical', hero: { title: 'AAD — Hierarchical', description: 'Arquitectura jerárquica: orchestrator → managers → workers, delegation, escalation, budget, governance.', badge: '5 preguntas' }, projection: true }
  ]},
  // 16-AID: 2 core + 1 proyección = 3
  { phaseId: '16-aid', phaseGroup: 'mcp', order: 16, variants: [
    { id: 'code-agent', name: 'AID — Code Agent', hero: { title: 'AID — Code Agent', description: 'Instrucciones Code Agent: workflow, coding standards, testing, quality gates, restrictions, uncertainty handling.', badge: '5 preguntas' } },
    { id: 'test-agent', name: 'AID — Test Agent', hero: { title: 'AID — Test Agent', description: 'Instrucciones Test Agent: generation workflow, test strategy, coverage targets, flakiness protocol, restrictions.', badge: '5 preguntas' } },
    { id: 'review-agent', name: 'AID — Review Agent', hero: { title: 'AID — Review Agent', description: 'Instrucciones Review Agent: dimensions, rules, classification, auto-fix policy, false positive management, compliance.', badge: '5 preguntas' }, projection: true }
  ]},
  // 17-Tasks: 2 core + 1 proyección = 3
  { phaseId: '17-tasks', phaseGroup: 'mcp', order: 17, variants: [
    { id: 'sprint', name: 'Tasks — Sprint', hero: { title: 'Tasks — Sprint', description: 'Descomposición en sprints: stories, tasks, bugs, spikes, capacity, DoD/DoR, risk mitigation.', badge: '5 preguntas' } },
    { id: 'kanban', name: 'Tasks — Kanban', hero: { title: 'Tasks — Kanban', description: 'Flujo continuo: WIP limits, classes of service, flow metrics, forecasting, continuous improvement.', badge: '5 preguntas' } },
    { id: 'chained-pr', name: 'Tasks — Chained PR', hero: { title: 'Tasks — Chained PR', description: 'Work units para chained PRs: atomic commits, reviewable slices, rollback boundaries, integration points.', badge: '5 preguntas' }, projection: true }
  ]},
  // 18-SOD: 2 core + 1 proyección = 3
  { phaseId: '18-sod', phaseGroup: 'mcp', order: 18, variants: [
    { id: 'pipeline', name: 'SOD — Pipeline', hero: { title: 'SOD — Pipeline', description: 'Orquestación pipeline CI/CD: stages, agents, gates, rollback, notifications, traceability, DORA metrics.', badge: '5 preguntas' } },
    { id: 'event-driven', name: 'SOD — Event-Driven', hero: { title: 'SOD — Event-Driven', description: 'Orquestación event-driven: event bus, choreography, saga, idempotency, dead letter, observability.', badge: '5 preguntas' } },
    { id: 'hierarchical', name: 'SOD — Hierarchical', hero: { title: 'SOD — Hierarchical', description: 'Orquestación jerárquica: orchestrator → managers → workers, delegation, escalation, budget, governance.', badge: '5 preguntas' }, projection: true }
  ]},
  // 19-TDD: 2 core + 1 proyección = 3
  { phaseId: '19-tdd', phaseGroup: 'mcp', order: 19, variants: [
    { id: 'classic', name: 'TDD — Clásico', hero: { title: 'TDD — Clásico', description: 'TDD clásico Kent Beck: Red-Green-Refactor, test granularity, doubles, coverage, refactoring rules, legacy.', badge: '5 preguntas' } },
    { id: 'atdd', name: 'TDD — ATDD/BDD', hero: { title: 'TDD — ATDD/BDD', description: 'Acceptance TDD: three amigos, Gherkin, living documentation, step definitions, collaboration workflow.', badge: '5 preguntas' } },
    { id: 'mutation', name: 'TDD — Mutation Testing', hero: { title: 'TDD — Mutation Testing', description: 'Mutation-driven TDD: mutation score, property-based testing, generative testing, equivalent mutants.', badge: '5 preguntas' }, projection: true }
  ]},
  // 20-ATD: 2 core + 1 proyección = 3
  { phaseId: '20-atd', phaseGroup: 'validacion', order: 20, variants: [
    { id: 'gherkin', name: 'ATD — Gherkin', hero: { title: 'ATD — Gherkin', description: 'Acceptance tests en Gherkin: feature files, step definitions, living docs, contract testing, traceability.', badge: '5 preguntas' } },
    { id: 'exploratory', name: 'ATD — Exploratory', hero: { title: 'ATD — Exploratory', description: 'Exploratory testing: session-based, charter-driven, heuristics (HICCUPPS/SFDPOT), debrief, automation handoff.', badge: '5 preguntas' } },
    { id: 'contract', name: 'ATD — Contract Testing', hero: { title: 'ATD — Contract Testing', description: 'Acceptance tests contract: consumer-driven contracts (Pact), provider verification, schema validation, Can-I-Deploy.', badge: '5 preguntas' }, projection: true }
  ]},
  // 21-STD: 2 core + 1 proyección = 3
  { phaseId: '21-std', phaseGroup: 'validacion', order: 21, variants: [
    { id: 'e2e', name: 'STD — E2E', hero: { title: 'STD — E2E', description: 'System tests E2E: critical journeys, cross-system, performance, chaos, observability validation, evidence.', badge: '5 preguntas' } },
    { id: 'contract', name: 'STD — Contract', hero: { title: 'STD — Contract', description: 'System tests contract: consumer-driven contracts, provider verification, schema validation, compatibility gates.', badge: '5 preguntas' } },
    { id: 'chaos', name: 'STD — Chaos Engineering', hero: { title: 'STD — Chaos Engineering', description: 'System tests chaos: hypothesis-driven, blast radius, automation, game days, learning, safety guardrails.', badge: '5 preguntas' }, projection: true }
  ]},
  // 22-VSD: 2 core + 1 proyección = 3
  { phaseId: '22-vsd', phaseGroup: 'validacion', order: 22, variants: [
    { id: 'compliance', name: 'VSD — Compliance', hero: { title: 'VSD — Compliance', description: 'Validación compliance: regulatory map, evidence matrix, SAST/DAST integration, pentest, audit trail, sign-off.', badge: '5 preguntas' } },
    { id: 'tecnico', name: 'VSD — Técnico', hero: { title: 'VSD — Técnico', description: 'Validación técnica: traceability matrix, coverage consolidation, quality gates, architecture compliance, performance.', badge: '5 preguntas' } },
    { id: 'business', name: 'VSD — Business', hero: { title: 'VSD — Business', description: 'Validación negocio: user story validation, metric validation, UX validation, stakeholder sign-off, GTM readiness.', badge: '5 preguntas' }, projection: true }
  ]},
  // 23-DEP: 2 core + 1 proyección = 3
  { phaseId: '23-dep', phaseGroup: 'operaciones', order: 23, variants: [
    { id: 'kubernetes', name: 'DEP — Kubernetes', hero: { title: 'DEP — Kubernetes', description: 'Despliegue K8s: manifests, Helm/Kustomize, GitOps, progressive delivery, rollback, verification, observability.', badge: '5 preguntas' } },
    { id: 'serverless', name: 'DEP — Serverless', hero: { title: 'DEP — Serverless', description: 'Despliegue serverless: functions, triggers, API Gateway, event-driven, IaC, canary, observability.', badge: '5 preguntas' } },
    { id: 'edge', name: 'DEP — Edge/Híbrido', hero: { title: 'DEP — Edge/Híbrido', description: 'Despliegue edge/híbrido: edge clusters, fleet management, disconnected operation, OTA updates, sync policies.', badge: '5 preguntas' }, projection: true }
  ]},
  // 24-MDD: 2 core + 1 proyección = 3
  { phaseId: '24-mdd', phaseGroup: 'operaciones', order: 24, variants: [
    { id: 'sre', name: 'MDD — SRE', hero: { title: 'MDD — SRE', description: 'Observabilidad SRE: SLI/SLO/SLA, error budgets, RED/USE, alerting philosophy, runbooks, incident response, on-call.', badge: '5 preguntas' } },
    { id: 'business', name: 'MDD — Business', hero: { title: 'MDD — Business', description: 'Observabilidad negocio: North Star, funnel, cohort, revenue, adoption, customer health, executive dashboards.', badge: '5 preguntas' } },
    { id: 'security', name: 'MDD — Security', hero: { title: 'MDD — Security', description: 'Observabilidad seguridad: threat detection, vulnerability management, compliance monitoring, audit logging, incident response.', badge: '5 preguntas' }, projection: true }
  ]},
  // 25-AED: 2 core + 1 proyección = 3
  { phaseId: '25-aed', phaseGroup: 'tecnico', order: 25, variants: [
    { id: 'tecnico', name: 'AED — Técnico', hero: { title: 'AED — Técnico', description: 'Evolución técnica: capacity planning, tech debt roadmap, modernization, migration patterns, decomposition, governance.', badge: '5 preguntas' } },
    { id: 'plataforma', name: 'AED — Plataforma', hero: { title: 'AED — Plataforma', description: 'Evolución plataforma: golden paths, self-service, multi-tenancy, fleet management, platform as product, DX.', badge: '5 preguntas' } },
    { id: 'estrategico', name: 'AED — Estratégico', hero: { title: 'AED — Estratégico', description: 'Evolución estratégica: business alignment, technology radar, competitive moats, M&A, regulatory, talent.', badge: '5 preguntas' }, projection: true }
  ]},
  // 26-CHD: 2 core + 1 proyección = 3
  { phaseId: '26-chd', phaseGroup: 'tecnico', order: 26, variants: [
    { id: 'estandar', name: 'CHD — Estándar', hero: { title: 'CHD — Estándar', description: 'Change management canónico: RFC, impact analysis, approval, implementation, testing, rollback, communication, PIR.', badge: '5 preguntas' } },
    { id: 'emergencia', name: 'CHD — Emergencia', hero: { title: 'CHD — Emergencia', description: 'Changes de emergencia: hotfix, security patch, accelerated process, post-hoc review, audit trail.', badge: '5 preguntas' } },
    { id: 'automatizado', name: 'CHD — Automatizado', hero: { title: 'CHD — Automatizado', description: 'Changes automatizados: dependabot, renovate, config drift, policy enforcement, self-healing, audit trail.', badge: '5 preguntas' }, projection: true }
  ]},
  // 27-CED: 2 core + 1 proyección = 3
  { phaseId: '27-ced', phaseGroup: 'marketing', order: 27, variants: [
    { id: 'tecnico', name: 'CED — Técnico', hero: { title: 'CED — Técnico', description: 'Explicaciones perfil técnico: profundidad completa, precisión, código, arquitectura, trade-offs, debugging, references.', badge: '5 preguntas' } },
    { id: 'ejecutivo', name: 'CED — Ejecutivo', hero: { title: 'CED — Ejecutivo', description: 'Explicaciones perfil ejecutivo: business impact, ROI, risk, strategic alignment, decisions needed, bottom-line.', badge: '5 preguntas' } },
    { id: 'no-tecnico', name: 'CED — No Técnico/Usuario', hero: { title: 'CED — No Técnico/Usuario', description: 'Explicaciones perfil usuario: analogías, storytelling, visual, actionable, empathy, trust-building, accessibility.', badge: '5 preguntas' }, projection: true }
  ]},
  // 28-CCA: 2 core + 1 proyección = 3
  { phaseId: '28-cca', phaseGroup: 'marketing', order: 28, variants: [
    { id: 'llm', name: 'CCA — LLM', hero: { title: 'CCA — LLM', description: 'Agente LLM: prompt templates, RAG, few-shot, evaluation, guardrails, human-in-loop, multi-modal output.', badge: '5 preguntas' } },
    { id: 'template', name: 'CCA — Template-Based', hero: { title: 'CCA — Template-Based', description: 'Agente template-based: rule-based, determinista, auditable, template library, variable extraction, composition.', badge: '5 preguntas' } },
    { id: 'hybrid', name: 'CCA — Híbrido', hero: { title: 'CCA — Híbrido', description: 'Agente híbrido: template-based structure + LLM content, best of both, cost control, quality, audit trail.', badge: '5 preguntas' }, projection: true }
  ]}
];

// ======== Preguntas base por fase (patrón 04-RDD-Questions.md) ========
const BASE_QUESTIONS = {
  '01-idd': [
    { section: 'trazabilidad', label: 'P1. ¿Cómo garantizar trazabilidad bidireccional IDD ↔ origen (idea bruta)?', options: [
      { value: 'A', label: 'A) Matriz Excel manual actualizada por analista al final de cada sprint' },
      { value: 'B', label: 'B) IDs únicos persistentes (IDD-XXX) con enlaces automatizados en repositorio (Git links, ADRs, tooling ALM)' },
      { value: 'C', label: 'C) Documento maestro Word con tabla de correspondencias versionado mensualmente' },
      { value: 'D', label: 'D) Trazabilidad solo en dirección IDD → origen; inversa se infiere en revisiones' }
    ], recommended: 'B', justification: 'IDs únicos + enlaces automatizados en tooling evitan desincronización manual y permiten consultas bidireccionales en tiempo real.' },
    { section: 'criterios', label: 'P2. ¿Criterio para decidir cuándo variante IDD "aplica" y cuándo no?', options: [
      { value: 'A', label: 'A) Aplica siempre por defecto; se elimina solo si stakeholder explícitamente lo descarta' },
      { value: 'B', label: 'B) Aplica si impacta arquitectura, costo, riesgo o compliance; se documenta justificación "no aplica" con evidencia' },
      { value: 'C', label: 'C) Solo aplican variantes con métricas cuantificables; cualitativas se dejan para fases posteriores' },
      { value: 'D', label: 'D) El arquitecto decide discrecionalmente en fase IDD sin registro formal' }
    ], recommended: 'B', justification: 'Criterio objetivo (impacto arquitectura/costo/riesgo/compliance) + justificación documentada evita omisiones arbitrarias y crea auditoría.' },
    { section: 'evolucion', label: 'P3. ¿Cómo manejar evolución de criterios cuando fases posteriores descubren gaps/ambigüedades?', options: [
      { value: 'A', label: 'A) Congelar IDD; gaps van a backlog técnico sin actualizar IDD' },
      { value: 'B', label: 'B) Ciclo de cambio formal: IDD → Change Request → Aprobación → Fases actualizadas; trazabilidad versión a versión' },
      { value: 'C', label: 'C) Actualizar IDD en caliente sin proceso; fases posteriores referencian última versión' },
      { value: 'D', label: 'D) Fases posteriores sobrescriben criterios; IDD queda como "baseline histórica"' }
    ], recommended: 'B', justification: 'Change Request formal preserva integridad de baseline IDD, mantiene trazabilidad y obliga análisis de impacto antes de modificar.' },
    { section: 'versionado', label: 'P4. ¿Proceso formal cambio/versionado IDD una vez alimenta PRD/BRD/RDD?', options: [
      { value: 'A', label: 'A) SemVer en IDD (MAJOR=breaking, MINOR=add, PATCH=fix); consumidores consumen versión pinned' },
      { value: 'B', label: 'B) Sin versionado; equipos leen última versión en wiki compartida' },
      { value: 'C', label: 'C) Branching por feature en repo docs; merge directo a main sin revisión' },
      { value: 'D', label: 'D) Versionado solo en consumidores; IDD inmutable post-aprobación' }
    ], recommended: 'A', justification: 'SemVer + pinned versions en consumidores permite evolución controlada y detecta breaking changes temprano.' },
    { section: 'actores', label: 'P5. ¿Cómo validar actores contra idea original cuando esta evoluciona en paralelo?', options: [
      { value: 'A', label: 'A) Revisión puntual al cierre de IDD; actores fijos thereafter' },
      { value: 'B', label: 'B) Actor Registry versionado y referenciado por IDD y fases posteriores; CI valida consistencia' },
      { value: 'C', label: 'C) Actores definidos solo en IDD; fases posteriores adaptan a posteriori' },
      { value: 'D', label: 'D) Workshop único al inicio; cambios por email informal' }
    ], recommended: 'B', justification: 'Actor Registry versionado + validación CI evita deriva silenciosa entre documentos que evolucionan en paralelo.' }
  ],
  // Para otras fases, usamos plantilla genérica adaptada
  default: [
    { section: 'trazabilidad', label: 'P1. ¿Cómo garantizar trazabilidad bidireccional con fases origen?', options: [
      { value: 'A', label: 'A) Matriz manual mantenida por analista' },
      { value: 'B', label: 'B) IDs únicos + enlaces automatizados en tooling (Git, ALM, ADRs)' },
      { value: 'C', label: 'C) Documento maestro versionado mensualmente' },
      { value: 'D', label: 'D) Solo trazabilidad forward; backward se infiere' }
    ], recommended: 'B', justification: 'IDs únicos + enlaces automatizados evitan desincronización y permiten consultas bidireccionales en tiempo real.' },
    { section: 'criterios', label: 'P2. ¿Criterio para decidir qué requisitos/casos "aplican" y cuáles no?', options: [
      { value: 'A', label: 'A) Aplica siempre por defecto; se elimina si stakeholder descarta' },
      { value: 'B', label: 'B) Aplica si impacta arquitectura, costo, riesgo o compliance; justificación documentada con evidencia' },
      { value: 'C', label: 'C) Solo aplican items con métricas cuantificables' },
      { value: 'D', label: 'D) Arquitecto decide discrecionalmente sin registro' }
    ], recommended: 'B', justification: 'Criterio objetivo + justificación documentada evita omisiones arbitrarias y crea auditoría.' },
    { section: 'evolucion', label: 'P3. ¿Cómo manejar evolución cuando fases posteriores descubren gaps?', options: [
      { value: 'A', label: 'A) Congelar documento; gaps van a backlog sin actualizar' },
      { value: 'B', label: 'B) Ciclo de cambio formal con trazabilidad versión a versión' },
      { value: 'C', label: 'C) Actualizar en caliente sin proceso formal' },
      { value: 'D', label: 'D) Fases posteriores sobrescriben; documento queda como baseline' }
    ], recommended: 'B', justification: 'Change Request formal preserva integridad, mantiene trazabilidad y obliga análisis de impacto.' },
    { section: 'versionado', label: 'P4. ¿Proceso formal de versionado una vez consumido por fases posteriores?', options: [
      { value: 'A', label: 'A) SemVer (MAJOR/MINOR/PATCH); consumidores usan versión pinned' },
      { value: 'B', label: 'B) Sin versionado; wiki compartida' },
      { value: 'C', label: 'C) Branching por feature; merge sin revisión' },
      { value: 'D', label: 'D) Solo versionado en consumidores; documento inmutable' }
    ], recommended: 'A', justification: 'SemVer + pinned versions permite evolución controlada y detecta breaking changes temprano.' },
    { section: 'consistencia', label: 'P5. ¿Cómo validar consistencia con fases origen cuando evolucionan en paralelo?', options: [
      { value: 'A', label: 'A) Revisión puntual al cierre; elementos fijos thereafter' },
      { value: 'B', label: 'B) Registry versionado (Actor/Concept/Decision Registry) + validación CI' },
      { value: 'C', label: 'C) Definidos solo en este documento; otros adaptan' },
      { value: 'D', label: 'D) Workshop único; cambios informales' }
    ], recommended: 'B', justification: 'Registry versionado + CI evita deriva silenciosa entre documentos que evolucionan en paralelo.' }
  ]
};

// ======== Utilidades ========
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildFields(questions) {
  const fields = [];
  questions.forEach((q, i) => {
    const baseId = slugify(q.section);
    // Radio question
    fields.push({
      id: baseId,
      sectionId: q.section,
      label: q.label,
      type: 'radio',
      required: true,
      options: q.options.map((opt, idx) => ({
        value: opt.value,
        label: opt.label,
        disabled: idx === 0,
        selected: idx === 0
      }))
    });
    // Detail textarea
    fields.push({
      id: `${baseId}_detail`,
      label: 'Justifica tu elección:',
      type: 'textarea',
      required: false,
      compact: true,
      fullWidth: true
    });
  });
  // Summary field (last)
  fields.push({
    id: 'summary',
    label: 'Resumen ejecutivo de decisiones (máx 300 caracteres):',
    type: 'textarea',
    placeholder: 'Ej: Se decidió B para trazabilidad por... Se adoptó SemVer para versionado...',
    required: true,
    fullWidth: true,
    validation: { minLength: 20, maxLength: 300, errorMessage: 'Entre 20 y 300 caracteres.' }
  });
  return fields;
}

function buildSections(questions) {
  const sections = {};
  questions.forEach(q => {
    sections[q.section] = {
      title: `${q.section.charAt(0).toUpperCase() + q.section.slice(1)}`,
      description: `Decisiones clave sobre ${q.section}`
    };
  });
  sections.resumen = { title: 'Resumen', description: 'Síntesis de decisiones tomadas' };
  return sections;
}

function generateConfig(phaseDef, variant) {
  const questions = BASE_QUESTIONS[phaseDef.phaseId] || BASE_QUESTIONS.default;
  const variantLabel = variant.name.replace(`${phaseDef.phaseId.toUpperCase().replace('-', ' ')} — `, '');

  return {
    phaseId: phaseDef.phaseId,
    variant: variant.id,
    phaseName: variant.name,
    phaseGroup: phaseDef.phaseGroup,
    order: phaseDef.order,
    schemaVersion: 1,
    hero: variant.hero,
    form: {
      title: variant.name,
      subtitle: `Preguntas de decisión arquitectónica para ${variantLabel}. Marca con * las obligatorias.`
    },
    sections: buildSections(questions),
    fields: buildFields(questions),
    webhook: {
      url: 'https://discord.com/api/webhooks/REEMPLAZAR_AL_DEPLOYAR',
      username: variant.name,
      avatarUrl: 'https://inovatrysolutions.com/assets/img/logo.webp',
      embeds: {
        title: variant.name,
        descriptionTemplate: '{{summary}}',
        fields: [
          { name: 'Variante', valueTemplate: '{{variant}}', inline: true },
          { name: 'Fase', valueTemplate: '{{phaseId}}', inline: true }
        ]
      }
    },
    maxTotalBytes: 8388608,
    allowedTypes: ['.pdf', '.doc', '.docx', '.txt', '.csv']
  };
}

function validateConfig(config) {
  // Validación básica sin AJV
  const errors = [];
  const requiredRoot = ['phaseId', 'phaseName', 'phaseGroup', 'order', 'schemaVersion', 'sections', 'fields', 'webhook'];
  for (const field of requiredRoot) {
    if (!(field in config)) errors.push(`Missing required field: ${field}`);
  }
  if (config.phaseId && !/^[a-z0-9-]+$/.test(config.phaseId)) errors.push('phaseId must be kebab-case');
  const validGroups = ['idd', 'rdd', 'mvp', 'validacion', 'investigacion', 'diseno', 'tecnico', 'negocio', 'marketing', 'legal', 'operaciones', 'finanzas', 'mcp', 'operaciones'];
  if (config.phaseGroup && !validGroups.includes(config.phaseGroup)) errors.push(`Invalid phaseGroup: ${config.phaseGroup}`);
  if (typeof config.order !== 'number' || config.order < 0) errors.push('order must be integer >= 0');
  if (!config.sections || typeof config.sections !== 'object') errors.push('sections must be object');
  if (!Array.isArray(config.fields) || config.fields.length === 0) errors.push('fields must be non-empty array');
  if (config.webhook) {
    if (!config.webhook.url || !/^https?:\/\//.test(config.webhook.url)) errors.push('webhook.url required, valid URI');
    if (!config.webhook.username) errors.push('webhook.username required');
    if (!config.webhook.avatarUrl || !/^https?:\/\//.test(config.webhook.avatarUrl)) errors.push('webhook.avatarUrl required, valid URI');
  }
  // Field validation
  const fieldIds = new Set();
  for (let i = 0; i < config.fields.length; i++) {
    const f = config.fields[i];
    if (!f.id || !/^[a-z][a-z0-9_]*$/.test(f.id)) errors.push(`fields[${i}].id: required, snake_case`);
    else if (fieldIds.has(f.id)) errors.push(`fields[${i}].id: duplicate ${f.id}`);
    else fieldIds.add(f.id);
    if (!f.label || f.label.length > 200) errors.push(`fields[${i}].label: required, max 200`);
    const validTypes = ['text', 'email', 'textarea', 'radio', 'checkbox', 'select', 'file', 'honeypot', 'hidden', 'readonly'];
    if (!validTypes.includes(f.type)) errors.push(`fields[${i}].type: invalid (${f.type})`);
    if (['radio', 'select', 'checkbox'].includes(f.type) && f.multiple) {
      if (!Array.isArray(f.options) || f.options.length === 0) errors.push(`fields[${i}]: ${f.type} requires options[]`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ======== Hash para detectar cambios en archivos existentes ========
function computeHash(content) {
  // Simple hash function for content comparison
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// ======== Main ========
async function main() {
  console.log('[Generator] Starting config generation...\n');

  // Ensure output dir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy 00-idea.json from Ecosistema to here if not exists
  const ecosystemConfigPath = path.join(__dirname, '../../00-Idea/configs/phases/00-idea.json');
  const localConfigPath = path.join(OUTPUT_DIR, '00-idea.json');
  if (fs.existsSync(ecosystemConfigPath) && !fs.existsSync(localConfigPath)) {
    fs.copyFileSync(ecosystemConfigPath, localConfigPath);
    console.log('[Generator] Copied 00-idea.json from Ecosistema');
  }

  let generated = 0;
  let valid = 0;
  let skipped = 0;
  let errors = 0;
  const registry = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    phases: [],
    variants: []
  };

  // Track seen phaseId+variant combinations to detect duplicates in definitions
  const seenVariantKeys = new Set();
  const duplicateDefinitions = [];

  // Generate each variant
  for (const phaseDef of PHASE_DEFINITIONS) {
    let baseWritten = false;
    for (const variant of phaseDef.variants) {
      const variantKey = `${phaseDef.phaseId}::${variant.id}`;
      
      // Check for duplicate definitions
      if (seenVariantKeys.has(variantKey)) {
        duplicateDefinitions.push(variantKey);
        console.log(`  ⚠️  Duplicate definition skipped: ${variantKey}`);
        continue;
      }
      seenVariantKeys.add(variantKey);

      const config = generateConfig(phaseDef, variant);
      const validation = validateConfig(config);

      if (validation.valid) {
        // Filename logic: first non-projection variant gets base name, others get variant suffix
        let filename;
        if (!variant.projection && !baseWritten) {
          filename = `${phaseDef.phaseId}.json`;
          baseWritten = true;
        } else {
          filename = `${phaseDef.phaseId}-${variant.id}.json`;
        }
        const filepath = path.join(OUTPUT_DIR, filename);
        
        // Check if file exists and compare hash to avoid unnecessary writes
        const newContent = JSON.stringify(config, null, 2);
        const newHash = computeHash(newContent);
        
        let shouldWrite = true;
        if (fs.existsSync(filepath)) {
          const existingContent = fs.readFileSync(filepath, 'utf8');
          const existingHash = computeHash(existingContent);
          if (existingHash === newHash) {
            console.log(`  ⏭️  ${filename} (unchanged, skipped)`);
            shouldWrite = false;
            skipped++;
          }
        }
        
        if (shouldWrite) {
          fs.writeFileSync(filepath, newContent);
          generated++;
          console.log(`  ✅ ${filename}`);
        }
        valid++;

        registry.variants.push({
          phaseId: phaseDef.phaseId,
          variant: variant.id,
          phaseName: variant.name,
          phaseGroup: phaseDef.phaseGroup,
          order: phaseDef.order,
          projection: variant.projection === true,
          file: filename
        });
      } else {
        console.log(`  ❌ ${phaseDef.phaseId}-${variant.id}: ${validation.errors.join(', ')}`);
        errors++;
      }
    }
    // Phase metadata (first variant as representative)
    const firstVariant = phaseDef.variants[0];
    registry.phases.push({
      phaseId: phaseDef.phaseId,
      phaseName: firstVariant.name.split(' — ')[0] || firstVariant.name,
      phaseGroup: phaseDef.phaseGroup,
      order: phaseDef.order,
      variantCount: phaseDef.variants.length,
      variants: phaseDef.variants.map(v => v.id)
    });
  }

  // Report duplicate definitions if any
  if (duplicateDefinitions.length > 0) {
    console.log(`\n  ⚠️  Duplicate definitions detected and skipped: ${duplicateDefinitions.join(', ')}`);
  }

  // Write registry
  const registryPath = path.join(OUTPUT_DIR, 'index.json');
  const registryContent = JSON.stringify(registry, null, 2);
  const registryHash = computeHash(registryContent);
  let writeRegistry = true;
  if (fs.existsSync(registryPath)) {
    const existingRegistry = fs.readFileSync(registryPath, 'utf8');
    if (computeHash(existingRegistry) === registryHash) {
      console.log(`\n  ⏭️  index.json (unchanged, skipped)`);
      writeRegistry = false;
    }
  }
  if (writeRegistry) {
    fs.writeFileSync(registryPath, registryContent);
    console.log(`\n  ✅ index.json (registry)`);
  }

  console.log(`\n[Generator] Done. Generated: ${generated}, Valid: ${valid}, Skipped (unchanged): ${skipped}, Errors: ${errors}`);
  console.log(`[Generator] Output: ${OUTPUT_DIR}`);

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('[Generator] Fatal error:', err);
  process.exit(1);
});