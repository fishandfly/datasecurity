import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuthCallbackPath,
  normalizePortalRedirectPath,
  parseAuthCallback,
  splitPublicAuthenticators,
} from './nocobase-auth-flow.ts'

test('splitPublicAuthenticators separates password and external authenticators with stable labels', () => {
  const result = splitPublicAuthenticators([
    {
      name: 'basic',
      authType: 'Email/Password',
      authTypeTitle: '密码',
      title: null,
      options: {
        allowSignUp: true,
      },
    },
    {
      name: 'ldap_password',
      authType: 'email/password',
      authTypeTitle: 'LDAP 密码登录',
      title: 'LDAP',
    },
    {
      name: 'oidc_provider',
      authType: 'oidc',
      authTypeTitle: 'OIDC',
      title: '统一认证',
      options: {
        oidc: {
          autoRedirect: false,
        },
      },
    },
  ])

  assert.deepEqual(
    result.passwordAuthenticators.map((item) => ({
      name: item.name,
      kind: item.kind,
      label: item.label,
    })),
    [
      {
        name: 'basic',
        kind: 'password',
        label: '密码',
      },
      {
        name: 'ldap_password',
        kind: 'password',
        label: 'LDAP',
      },
    ],
  )

  assert.deepEqual(
    result.externalAuthenticators.map((item) => ({
      name: item.name,
      kind: item.kind,
      label: item.label,
      actionResource: item.actionResource,
    })),
    [
      {
        name: 'oidc_provider',
        kind: 'external',
        label: '统一认证',
        actionResource: 'oidc',
      },
    ],
  )

  assert.equal(result.defaultPasswordAuthenticator?.name, 'basic')
})

test('buildAuthCallbackPath keeps the callback inside the data-catalog login route and preserves redirect target', () => {
  assert.equal(
    buildAuthCallbackPath({
      redirectTo: '/catalog/1001?tab=api#section-2',
    }),
    '/data-catalog/login?redirectTo=%2Fcatalog%2F1001%3Ftab%3Dapi%23section-2',
  )

  assert.equal(
    buildAuthCallbackPath({
      loginPath: '/data-catalog/auth/callback',
      redirectTo: 'https://example.com/hijack',
    }),
    '/data-catalog/auth/callback?redirectTo=%2F',
  )
})

test('parseAuthCallback extracts token payload and strips auth params from the callback url', () => {
  const result = parseAuthCallback(
    'http://localhost:5173/data-catalog/login?token=test-token&authenticator=oidc_provider&redirectTo=%2Fcatalog%2F1001%3Ftab%3Dapi&embed=1',
  )

  assert.deepEqual(result, {
    token: 'test-token',
    authenticator: 'oidc_provider',
    redirectTo: '/catalog/1001?tab=api',
    cleanPath: '/data-catalog/login?redirectTo=%2Fcatalog%2F1001%3Ftab%3Dapi&embed=1',
  })
})

test('normalizePortalRedirectPath only accepts root-relative in-app targets', () => {
  assert.equal(normalizePortalRedirectPath('/personal-center'), '/personal-center')
  assert.equal(normalizePortalRedirectPath('/catalog/1001?tab=api'), '/catalog/1001?tab=api')
  assert.equal(normalizePortalRedirectPath('//evil.example.com/steal'), '/')
  assert.equal(normalizePortalRedirectPath('javascript:alert(1)'), '/')
  assert.equal(normalizePortalRedirectPath(''), '/')
})
