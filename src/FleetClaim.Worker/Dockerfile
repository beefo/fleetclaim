FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files and restore
COPY src/FleetClaim.Core/FleetClaim.Core.csproj FleetClaim.Core/
COPY src/FleetClaim.Worker/FleetClaim.Worker.csproj FleetClaim.Worker/
RUN dotnet restore FleetClaim.Worker/FleetClaim.Worker.csproj

# Copy source and build
COPY src/FleetClaim.Core/ FleetClaim.Core/
COPY src/FleetClaim.Worker/ FleetClaim.Worker/
RUN dotnet publish FleetClaim.Worker/FleetClaim.Worker.csproj -c Release -o /app

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "FleetClaim.Worker.dll"]
