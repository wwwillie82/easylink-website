export const ADMIN_TIME_ZONE = 'Europe/Budapest';

function dateTimeParts(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ADMIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function formatAdminDateTime(value, fallback = '—') {
  const parts = dateTimeParts(value);
  if (!parts) return value === undefined || value === null || value === '' ? fallback : String(value);
  return `${parts.year}.${parts.month}.${parts.day}. ${parts.hour}:${parts.minute}:${parts.second} (${ADMIN_TIME_ZONE})`;
}

export function adminDateTimeClientSource(functionName = 'formatAdminDateTime') {
  const safeName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName) ? functionName : 'formatAdminDateTime';
  return `function ${safeName}(value,fallback='—'){if(value===undefined||value===null||value==='')return fallback;const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))return String(value);const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:${JSON.stringify(ADMIN_TIME_ZONE)},year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});const parts=Object.fromEntries(formatter.formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return parts.year+'.'+parts.month+'.'+parts.day+'. '+parts.hour+':'+parts.minute+':'+parts.second+' (${ADMIN_TIME_ZONE})';}`;
}
