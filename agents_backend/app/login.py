import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.security.utils import get_authorization_scheme_param
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
from pydantic import BaseModel
from starlette.status import HTTP_401_UNAUTHORIZED

from app.config import settings

router = APIRouter(
    tags=["login"],
)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


class GoogleTokenRequest(BaseModel):
    credential: str


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access-token")
    return {"detail": "Logged out"}


@router.post("/auth/google")
async def google_auth(token_request: GoogleTokenRequest):
    """Verify Google ID token and authenticate user"""
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            token_request.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )

        # Verify the issuer
        if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValueError("Wrong issuer.")

        # Get user info from the token
        email = idinfo.get("email")
        name = idinfo.get("name")
        email_verified = idinfo.get("email_verified", False)

        if not email_verified:
            raise HTTPException(status_code=400, detail="Email not verified by Google")

        # Create or get user from database
        # Use email as username for Google users
        username = email

        # if not await get_user(db, username):
        #     user = UserInDB(
        #         user_id=str(uuid.uuid4()),
        #         username=username,
        #         email=email,
        #         full_name=name,
        #         hashed_password=None,
        #     )
        #     await insert_user(db, user)
        #     logger.info(f"Created new Google user: {username}")
        # else:
        #     logger.info(f"Existing Google user logged in: {username}")

        # Create access token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(data={"sub": username}, expires_delta=access_token_expires)

        # Create response
        response_data = {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"username": username, "email": email, "full_name": name},
        }

        response = JSONResponse(content=response_data)

        # Set the cookie
        cookie_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        response.set_cookie(
            key="access-token",
            value=f"Bearer {access_token}",
            max_age=cookie_max_age,
            httponly=True,
            secure=settings.IS_PRODUCTION,  # Use secure cookies in production (HTTPS)
            samesite="none" if settings.IS_PRODUCTION else "lax",  # Allow cross-origin in production
            domain=None,  # Let browser determine domain
        )

        return response

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Google token")
    except Exception:
        raise HTTPException(status_code=500, detail="Authentication failed")


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class NotAuthenticatedException(Exception):
    pass


class OAuth2PasswordBearerWithCookieOrHeader(OAuth2PasswordBearer):
    def __init__(
        self,
        tokenUrl: str,
        scheme_name: Optional[str] = None,
        scopes: Optional[dict[str, str]] = None,
        auto_error: bool = True,
        cookie_name: str = "access-token",
    ):
        self.cookie_name = cookie_name
        super().__init__(tokenUrl=tokenUrl, scheme_name=scheme_name, scopes=scopes, auto_error=auto_error)

    async def __call__(self, request: Request) -> Optional[str]:
        # Get logger for this method - this is acceptable as it's a framework method
        # and can't easily receive dependency injection
        logger = logging.getLogger(__name__)

        # Log the request headers and cookies for debugging
        # logger.info(f"Auth Headers: {dict(request.headers)}")
        # logger.info(f"Auth Cookies: {dict(request.cookies)}")

        # First check Authorization header (preferred for frontend-based auth)
        header_authorization = request.headers.get("Authorization")
        if header_authorization:
            scheme, param = get_authorization_scheme_param(header_authorization)
            if scheme.lower() == "bearer":
                logger.info(f"Found bearer token in header: {param[:10]}...")
                return param

        # Try all possible cookie names for backward compatibility
        cookie_names = [self.cookie_name, "access_token_cookie", "access_token"]

        for cookie_name in cookie_names:
            cookie_authorization = request.cookies.get(cookie_name)
            if cookie_authorization:
                # logger.info(f"Found authorization in cookie '{cookie_name}': {cookie_authorization[:10]}...")

                # The cookie value itself might be in the format "Bearer <token>"
                # or it might just be the token directly
                if cookie_authorization.startswith('"Bearer '):
                    # Handle the case where the cookie includes quotes and Bearer
                    # This happens when the cookie is set with the literal value "Bearer <token>"
                    token = cookie_authorization[8:-1]  # Remove '"Bearer ' prefix and '"' suffix
                    # logger.info(f"Found quoted bearer token in cookie: {token[:10]}...")
                    return token

                scheme, param = get_authorization_scheme_param(cookie_authorization)
                if scheme.lower() == "bearer":
                    # logger.info(f"Found bearer scheme in cookie: {param[:10]}...")
                    return param

                # If there's no scheme, treat the whole cookie as the token
                # logger.info(f"Using cookie value as token: {cookie_authorization[:10]}...")
                return cookie_authorization

        # If no valid authorization found
        logger.warning("No authorization token found")
        if self.auto_error:
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return None


oauth2_scheme = OAuth2PasswordBearerWithCookieOrHeader(tokenUrl="token", auto_error=False)
TokenDep = Annotated[str, Depends(oauth2_scheme)]


async def get_current_user(token: TokenDep):
    if not token:
        raise NotAuthenticatedException

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        username: str = payload.get("sub")
        if username is None:
            raise NotAuthenticatedException

        token_data = TokenData(username=username)
    except InvalidTokenError as e:
        raise NotAuthenticatedException from e

    return token_data.username


CurrentUser = Annotated[str, Depends(get_current_user)]
