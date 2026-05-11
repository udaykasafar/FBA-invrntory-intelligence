import urllib.request
import uuid
from io import BytesIO

boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
body = BytesIO()

def add_field(name, filename, value):
    body.write(f'--{boundary}\r\n'.encode('utf-8'))
    body.write(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode('utf-8'))
    body.write(b'Content-Type: text/csv\r\n\r\n')
    body.write(value.encode('utf-8'))
    body.write(b'\r\n')

add_field('shipment', 'shipment.csv', 'Loading Date,Appointment ID,Shipment ID,SKU,Qty\n2025-01-01,A1,S1,SKU1,10\n')
add_field('sales', 'sales.csv', 'ASIN,SKU,FNSKU,Qty\nB0001,SKU1,FNSKU1,15\n')
add_field('stock', 'stock.csv', 'SKU,ASIN,FNSKU,Qty\nSKU1,B0001,FNSKU1,20\n')
body.write(f'--{boundary}--\r\n'.encode('utf-8'))

req = urllib.request.Request('http://127.0.0.1:5000/api/analyze', data=body.getvalue())
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
req.add_header('Content-Length', str(len(body.getvalue())))
with urllib.request.urlopen(req, timeout=20) as resp:
    print(resp.status)
    print(resp.read().decode('utf-8'))
