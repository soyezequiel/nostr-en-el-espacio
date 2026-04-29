import authEn from '../../messages/en/auth.json';
import badgesEn from '../../messages/en/badges.json';
import commonEn from '../../messages/en/common.json';
import landingEn from '../../messages/en/landing.json';
import profileEn from '../../messages/en/profile.json';
import sigmaEn from '../../messages/en/sigma.json';
import authEs from '../../messages/es/auth.json';
import badgesEs from '../../messages/es/badges.json';
import commonEs from '../../messages/es/common.json';
import landingEs from '../../messages/es/landing.json';
import profileEs from '../../messages/es/profile.json';
import sigmaEs from '../../messages/es/sigma.json';
import type {Locale} from '@/i18n/routing';

const messagesByLocale = {
  en: {
    auth: authEn,
    badges: badgesEn,
    common: commonEn,
    landing: landingEn,
    profile: profileEn,
    sigma: sigmaEn,
  },
  es: {
    auth: authEs,
    badges: badgesEs,
    common: commonEs,
    landing: landingEs,
    profile: profileEs,
    sigma: sigmaEs,
  },
} as const;

export async function getMessagesForLocale(locale: Locale) {
  return messagesByLocale[locale];
}

export function getMessageNamespaces(locale: Locale) {
  return messagesByLocale[locale];
}
