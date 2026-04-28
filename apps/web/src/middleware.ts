import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import {
  CHAT_SESSION_COOKIE,
  CHAT_SESSION_MAX_AGE_S,
  encodeChatSessionValue,
} from '@/lib/chat/session';
import { verifyChatToken } from '@/lib/chat/tokens';

/**
 * Sprint-6-completion: when a request lands on `/c/[token]`, verify the
 * token and set the chat-scoped session cookie on the response.
 *
 * Why middleware: Server Components in Next.js 15+ throw on
 * `cookies().set()`. Middleware is the legal place to write a cookie
 * during a navigation.
 *
 * On verify failure (bad signature, expired, malformed) the middleware
 * silently passes through — the page itself will surface the appropriate
 * 404 / "link expired" UI with its own `verifyChatToken` call. The cookie
 * write is purely a "happy-path" affordance.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const chatMatch = path.match(/^\/c\/([^/]+)$/);

  if (chatMatch) {
    const token = decodeURIComponent(chatMatch[1] ?? '');
    const response = NextResponse.next({ request });
    try {
      const payload = await verifyChatToken(token);
      response.cookies.set({
        name: CHAT_SESSION_COOKIE,
        value: encodeChatSessionValue({
          bookingId: payload.bookingId,
          conversationId: payload.conversationId,
        }),
        httpOnly: true,
        sameSite: 'lax',
        path: '/c',
        secure: process.env.NODE_ENV === 'production',
        maxAge: CHAT_SESSION_MAX_AGE_S,
      });
    } catch {
      // Verification failed — pass through without setting the cookie.
      // The page handler renders the expired/404 surface.
    }
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - any file with a static extension
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
