import {NextResponse} from 'next/server';
export async function GET(){return NextResponse.json({ready:false,missing:['LEAD_DELIVERY_NOT_CONFIGURED']})}
export async function POST(){return NextResponse.json({error:'Приём заявок ещё не подключён'}, {status:503})}
