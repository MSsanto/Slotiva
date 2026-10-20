import logging
import os
from datetime import date
from uuid import UUID
import psycopg
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from . import security, services
from .db import connect
from .models import BookingInput, HoursInput, LoginInput, RescheduleInput

app = FastAPI(title='Slotiva API', version='0.2.0')
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get('ALLOWED_ORIGINS','http://localhost:5173').split(','),allow_credentials=True,allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Content-Type','X-Cancel-Token'])
logger = logging.getLogger('slotiva')


@app.exception_handler(psycopg.errors.ExclusionViolation)
def conflict_handler(request, exc):
    return JSONResponse(status_code=409,content={'detail':'Este horário não está mais disponível. Escolha outro.'})


@app.exception_handler(psycopg.OperationalError)
def database_error(request, exc):
    logger.error('Database unavailable')
    return JSONResponse(status_code=503,content={'detail':'Serviço temporariamente indisponível. Tente novamente.'})


@app.middleware('http')
async def private_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.get('/api/health')
def health():
    with connect() as conn:
        conn.execute('SELECT 1')
    return {'status':'ok'}


@app.get('/api/services')
def services_list():
    return services.SERVICES


@app.get('/api/calendar')
def calendar():
    return {'today':services.today().isoformat(),'timezone':'America/Sao_Paulo','horizonDays':14}


@app.get('/api/availability')
def availability(date: date, serviceId: str):
    return services.availability(date,serviceId)


@app.post('/api/bookings',status_code=201)
def book(data: BookingInput):
    return services.create_booking(data)


@app.delete('/api/bookings/{booking_id}',status_code=204)
def cancel(booking_id: UUID, x_cancel_token: str = Header(min_length=32,max_length=100)):
    services.cancel_booking(booking_id,x_cancel_token)


@app.put('/api/bookings/{booking_id}')
def reschedule(booking_id: UUID, data: RescheduleInput, x_cancel_token: str = Header(min_length=32,max_length=100)):
    return services.reschedule(booking_id,x_cancel_token,data)


@app.post('/api/admin/login',status_code=204)
def login(data: LoginInput,request: Request,response: Response):
    token = security.login(request,data.password)
    response.set_cookie('slotiva_session',token,httponly=True,secure=os.environ.get('COOKIE_SECURE','true').lower()=='true',samesite='lax',max_age=28800,path='/api/admin')


@app.get('/api/admin/session',dependencies=[Depends(security.require_admin)])
def session():
    return {'authenticated':True}


@app.post('/api/admin/logout',status_code=204,dependencies=[Depends(security.trusted_origin)])
def logout(request: Request,response: Response):
    with connect() as conn:
        conn.execute('DELETE FROM sessions WHERE token_hash=%s',(security.digest(request.cookies.get('slotiva_session','')),))
    response.delete_cookie('slotiva_session',path='/api/admin')


@app.get('/api/admin/bookings',dependencies=[Depends(security.require_admin)])
def bookings():
    return services.list_bookings()


@app.delete('/api/admin/bookings/{booking_id}',status_code=204,dependencies=[Depends(security.require_admin),Depends(security.trusted_origin)])
def admin_cancel(booking_id: UUID):
    services.cancel_booking(booking_id)


@app.get('/api/admin/hours',dependencies=[Depends(security.require_admin)])
def hours():
    return services.get_hours()


@app.put('/api/admin/hours',dependencies=[Depends(security.require_admin),Depends(security.trusted_origin)])
def set_hours(data: HoursInput):
    return services.update_hours(data)
