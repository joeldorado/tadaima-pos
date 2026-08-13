import React, { useEffect } from 'react'
import { ShieldCheck, Mail, Camera, Database, Lock, UserCheck } from 'lucide-react'

// Página PÚBLICA (sin sesión): política de privacidad del software.
// URL canónica: /privacidad (alias /politicas). Mismo lenguaje visual que
// LoginPage: fondo oscuro degradado + cards glass + acento rojo Tadaima.

const BG = 'linear-gradient(150deg, #09090e 0%, #140303 55%, #080710 100%)'
const RED = '#E0221A'

const LAST_UPDATED = '12 de agosto de 2026'
const EFFECTIVE_DATE = '12 de agosto de 2026'
const CONTACT_EMAIL = 'tadaima@gmail.com'

const textMuted = 'rgba(255,255,255,0.55)'
const textBody = 'rgba(255,255,255,0.78)'
const textStrong = 'rgba(255,255,255,0.92)'

function SectionCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <section
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {children}
    </section>
  )
}

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <h2 className="flex items-baseline gap-3 mb-4">
      <span
        style={{
          fontSize: 13,
          fontWeight: 900,
          color: RED,
          letterSpacing: '0.05em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, color: textStrong, letterSpacing: '-0.01em' }}>
        {children}
      </span>
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p style={{ fontSize: 14, lineHeight: 1.75, color: textBody }} className="mb-3 last:mb-0">
      {children}
    </p>
  )
}

function B({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <strong style={{ color: textStrong, fontWeight: 700 }}>{children}</strong>
}

function List({ items }: { items: React.ReactNode[] }): React.JSX.Element {
  return (
    <ul className="mb-3 last:mb-0 flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3" style={{ fontSize: 14, lineHeight: 1.7, color: textBody }}>
          <span aria-hidden style={{ color: RED, fontWeight: 900, lineHeight: 1.7 }}>—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SubHead({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <p
      className="flex items-center gap-2 mt-5 mb-2"
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)',
      }}
    >
      {icon}
      {children}
    </p>
  )
}

function Callout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className="rounded-xl px-4 py-3 mt-4"
      style={{
        background: 'rgba(224,34,26,0.06)',
        border: '1px solid rgba(224,34,26,0.18)',
        fontSize: 13,
        lineHeight: 1.65,
        color: textBody,
      }}
    >
      {children}
    </div>
  )
}

export function PrivacyPolicyPage(): React.JSX.Element {
  useEffect(() => {
    const prev = document.title
    document.title = 'Política de Privacidad — Tadaima POS'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

        {/* ── Encabezado ── */}
        <header className="flex flex-col items-center text-center mb-10">
          <div
            className="flex items-center justify-center overflow-hidden mb-5"
            style={{
              background: '#fff',
              borderRadius: 10,
              width: 180,
              height: 84,
              padding: 8,
              boxShadow: '0 0 18px rgba(204,34,0,0.4)',
              border: '1px solid rgba(204,34,0,0.15)',
            }}
          >
            <img
              src="/tadaima-logo.jpeg"
              alt="Tadaima"
              style={{ width: '130%', height: '130%', objectFit: 'contain' }}
              onError={e => {
                const el = e.currentTarget
                el.style.display = 'none'
                const fallback = el.nextElementSibling as HTMLElement | null
                if (fallback) fallback.style.display = 'block'
              }}
            />
            <span style={{ fontSize: 18, fontWeight: 900, color: RED, letterSpacing: '-0.02em', display: 'none' }}>
              Tadaima
            </span>
          </div>

          <p
            className="mb-2"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.25em',
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase',
            }}
          >
            Software POS — Tadaima POS
          </p>
          <h1
            className="flex items-center gap-3"
            style={{ fontSize: 28, fontWeight: 900, color: textStrong, letterSpacing: '-0.02em' }}
          >
            <ShieldCheck size={26} style={{ color: RED }} aria-hidden />
            Política de Privacidad
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span
              className="rounded-full px-3 py-1"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: textMuted,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
            >
              Última actualización: {LAST_UPDATED}
            </span>
            <span
              className="rounded-full px-3 py-1"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: textMuted,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
            >
              Vigente a partir de: {EFFECTIVE_DATE}
            </span>
          </div>
        </header>

        {/* ── Contenido ── */}
        <div className="flex flex-col gap-4">

          <SectionCard>
            <SectionTitle n="1.">Identidad y domicilio del responsable</SectionTitle>
            <P>
              La aplicación <B>Software POS (Tadaima POS)</B> (en adelante, «la Aplicación») es
              operada por <B>Tadaima</B>, con domicilio en Tijuana, Baja California, México (en
              adelante, «nosotros» o «el Responsable»). El Responsable es quien decide sobre el
              tratamiento de los datos recabados a través de la Aplicación.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="2.">Alcance y a quién aplica</SectionTitle>
            <P>
              La Aplicación es una herramienta de uso <B>interno y profesional</B>, destinada
              exclusivamente a empleados, administradores y personal autorizado de los negocios y
              sucursales que contratan el servicio. No está dirigida al público general ni a
              consumidores finales, y su acceso requiere credenciales otorgadas por el
              administrador del negocio.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="3.">Datos personales que recopilamos</SectionTitle>
            <P>
              Para operar, la Aplicación recopila y trata únicamente los datos necesarios para su
              funcionamiento:
            </P>

            <SubHead icon={<UserCheck size={13} aria-hidden />}>
              a) Datos de identificación y acceso (del usuario autorizado)
            </SubHead>
            <List
              items={[
                <>Correo electrónico y contraseña (cifrada) para el inicio de sesión y autenticación.</>,
                <>Nombre del usuario y rol asignado (administrador, gerente o cajero) dentro del sistema.</>,
                <>Tienda o sucursal a la que está asignado el usuario.</>,
              ]}
            />

            <SubHead icon={<Database size={13} aria-hidden />}>
              b) Datos operativos del negocio
            </SubHead>
            <P>
              No son datos personales del usuario, sino información comercial del establecimiento:
            </P>
            <List
              items={[
                <>Inventario y catálogo de productos.</>,
                <>Transacciones de venta, cortes de caja, movimientos de efectivo e insumos.</>,
                <>Reportes e historial de operaciones generados dentro del sistema.</>,
              ]}
            />

            <SubHead icon={<Camera size={13} aria-hidden />}>
              c) Permisos del dispositivo (solo cuando el usuario los activa)
            </SubHead>
            <List
              items={[
                <>
                  <B>Cámara:</B> únicamente para escanear códigos de barras de productos y capturar
                  imágenes de productos del catálogo. La Aplicación no graba video ni utiliza la
                  cámara en segundo plano.
                </>,
                <>
                  <B>Almacenamiento / fotos:</B> únicamente para seleccionar imágenes de productos
                  que el usuario decide subir al catálogo.
                </>,
              ]}
            />

            <Callout>
              No recopilamos datos de ubicación (GPS), contactos, ni información de dispositivos con
              fines de rastreo publicitario.
            </Callout>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="4.">Finalidad del tratamiento</SectionTitle>
            <P>Los datos se utilizan única y exclusivamente para:</P>
            <List
              items={[
                <>Autenticar y controlar el acceso de los usuarios autorizados al sistema.</>,
                <>
                  Operar y administrar internamente las funciones del punto de venta (ventas,
                  inventario, caja, reportes y control de personal).
                </>,
                <>
                  Mantener la seguridad, integridad y trazabilidad de las operaciones de cada
                  sucursal.
                </>,
              ]}
            />
            <Callout>
              No utilizamos los datos con fines de mercadotecnia, publicidad, elaboración de
              perfiles comerciales, ni los vendemos.
            </Callout>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="5.">Base para el tratamiento</SectionTitle>
            <P>
              El tratamiento se realiza en el marco de la relación laboral, contractual o de
              prestación de servicios entre el negocio y sus usuarios autorizados, y con el fin
              legítimo de administrar la operación interna del establecimiento.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="6.">Transferencia y no divulgación a terceros</SectionTitle>
            <P>
              <B>No compartimos, vendemos ni rentamos</B> los datos personales a terceros con fines
              comerciales o publicitarios.
            </P>
            <P>
              Los datos podrán ser tratados por proveedores de infraestructura tecnológica (por
              ejemplo, servicios de alojamiento y bases de datos en la nube) que actúan como
              encargados del tratamiento por cuenta del Responsable, únicamente para hospedar y
              procesar la información, bajo obligaciones de confidencialidad y seguridad,
              como <B>Google Cloud Platform</B>.
            </P>
            <P>
              Solo divulgaremos información cuando exista una obligación legal, requerimiento de
              autoridad competente o mandato judicial.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="7.">Almacenamiento, seguridad y transferencias internacionales</SectionTitle>
            <List
              items={[
                <>
                  Las contraseñas se almacenan cifradas; la comunicación con nuestros servidores se
                  realiza mediante conexiones seguras (HTTPS/TLS).
                </>,
                <>
                  Implementamos medidas administrativas, técnicas y físicas razonables para proteger
                  los datos contra pérdida, acceso no autorizado o alteración.
                </>,
                <>
                  La información puede alojarse en servidores ubicados fuera de México (según el
                  proveedor de nube). Al utilizar la Aplicación, el usuario y el negocio reconocen
                  que dicha transferencia es necesaria para la prestación del servicio.
                </>,
              ]}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle n="8.">Conservación de los datos</SectionTitle>
            <P>
              Los datos se conservan durante el tiempo que el usuario mantenga una cuenta activa y
              por el periodo necesario para cumplir las finalidades descritas y las obligaciones
              legales, fiscales o contables aplicables. Una vez concluido dicho periodo, los datos
              se eliminan o anonimizan de forma segura.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="9.">Menores de edad</SectionTitle>
            <P>
              La Aplicación no está dirigida a menores de 18 años y no recopila de forma consciente
              datos de personas menores de edad. Su uso está restringido a personal autorizado de
              los negocios.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="10.">Derechos del usuario (Derechos ARCO)</SectionTitle>
            <P>
              El usuario puede ejercer sus derechos de <B>Acceso, Rectificación, Cancelación y
              Oposición (ARCO)</B>, así como solicitar la actualización o baja de sus credenciales.
            </P>
            <P>
              Dado que la Aplicación es una herramienta administrada por cada negocio, el usuario
              deberá realizar estas solicitudes a través del administrador del sistema de su
              empresa, quien las gestionará dentro de la plataforma. Para solicitudes que no puedan
              resolverse por esa vía, puede contactarnos al correo indicado en la sección de
              Contacto.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="11.">Cambios a esta Política de Privacidad</SectionTitle>
            <P>
              Podremos actualizar esta Política para reflejar cambios en la Aplicación o en la
              normativa aplicable. Cualquier modificación se publicará en esta misma dirección,
              indicando la fecha de última actualización. El uso continuo de la Aplicación después
              de dichos cambios implica la aceptación de la Política vigente.
            </P>
          </SectionCard>

          <SectionCard>
            <SectionTitle n="12.">Contacto</SectionTitle>
            <P>
              Para dudas, solicitudes o el ejercicio de derechos relacionados con esta Política de
              Privacidad, escríbenos a:
            </P>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 mt-1"
              style={{
                background: 'rgba(224,34,26,0.08)',
                border: '1px solid rgba(224,34,26,0.25)',
                color: textStrong,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <Mail size={15} style={{ color: RED }} aria-hidden />
              {CONTACT_EMAIL}
            </a>
          </SectionCard>
        </div>

        {/* ── Pie ── */}
        <footer className="flex items-center justify-center gap-2 mt-10">
          <Lock size={12} style={{ color: 'rgba(255,255,255,0.25)' }} aria-hidden />
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.25)',
              textTransform: 'uppercase',
            }}
          >
            Tadaima POS · Uso interno autorizado
          </p>
        </footer>
      </div>
    </div>
  )
}
