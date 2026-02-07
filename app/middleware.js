// middleware.js
// Place this in your project ROOT (not in app folder)

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/program(.*)',
  '/api/stripe/checkout',
  '/api/stripe/portal',
  '/api/stripe/subscription-status',
]);

// Public routes that should bypass auth
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/signup(.*)',
  '/pricing(.*)',
  '/success(.*)',
  '/api/stripe/webhook',
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId, redirectToSignIn } = await auth();
  
  // Allow public routes
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }
  
  // Protected routes require authentication
  if (isProtectedRoute(request) && !userId) {
    return redirectToSignIn();
  }
  
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
