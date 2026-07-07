import { publishedSolutions } from './solutions';
import { publishedAudiences } from './audiences';
import { publishedIntegrations } from './integrations';
export const deployUrl = import.meta.env.PUBLIC_DEPLOY_URL ?? 'https://deploy.easylink.hu';
export const siteNavigation = [
  { title:'Megoldásaink', href:'/megoldasaink/', children: publishedSolutions.map((i)=>({title:i.title,href:`/megoldasaink/${i.slug}/`})) },
  { title:'Kinek szól?', href:'/kinek-szol/', children: publishedAudiences.map((i)=>({title:i.title,href:`/kinek-szol/${i.slug}/`})) },
  { title:'Integrációk', href:'/integraciok/', children: publishedIntegrations.map((i)=>({title:i.title,href:'/integraciok/'})) },
  { title:'Áraink', href:'/arak/' },
  { title:'Kapcsolat', href:'/kapcsolat/' }
];
